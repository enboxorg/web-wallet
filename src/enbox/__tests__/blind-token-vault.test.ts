import { describe, expect, it, vi } from 'vitest';
import { RSABSSA } from '@cloudflare/blindrsa-ts';

import {
  formatKeyId,
  fromBase64Url,
  type MintConfigDocument,
  parseKeyId,
  type ServerBlindTokenDescriptor,
  toBase64Url,
} from '@/lib/blind-tokens';
import {
  BLIND_TOKENS_SECRET_KEY,
  claimAndStoreInvite,
  getVaultSummary,
  hasCreditsForEndpoint,
  loadBlindTokenVault,
  redeemStorageBlockForDid,
  refreshMintCredits,
} from '../blind-token-vault';

function createMemorySecretAgent() {
  const store = new Map<string, Uint8Array>();
  return {
    agentDid: { uri: 'did:dht:agent' },
    secrets: {
      get: vi.fn(async (key: string) => store.get(key)),
      put: vi.fn(async (key: string, value: Uint8Array) => {
        store.set(key, value);
      }),
    },
    _store: store,
  };
}

async function makeBackendMock() {
  const rsaKeys = new Map<string, CryptoKeyPair>();
  const keys = [];
  const specs = [
    { aud: 'mint', unit: 'c1', epoch: '2026-Q4' },
    { aud: 'mint', unit: 'c4', epoch: '2026-Q4' },
    { aud: 'mint', unit: 'c16', epoch: '2026-Q4' },
    { aud: 'dwn-cf-east', unit: 'storage-50mb-1yr', epoch: '2026-Q4' },
    { aud: 'dwn-cf-west', unit: 'storage-50mb-1yr', epoch: '2026-Q4' },
  ];

  for (const spec of specs) {
    const kid = formatKeyId(spec.aud, spec.unit, spec.epoch);
    const pair = await RSABSSA.SHA384.generateKey({
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    });
    rsaKeys.set(kid, pair);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    keys.push({
      kty: 'RSA' as const,
      n: jwk.n!,
      e: jwk.e!,
      alg: 'PS384' as const,
      use: 'sig' as const,
      kid,
      aud: spec.aud,
      unit: spec.unit,
      epoch: spec.epoch,
      notAfter: '2027-01-01T00:00:00.000Z',
      redeemBefore: '2028-01-01T00:00:00.000Z',
      active: true,
    });
  }

  const config: MintConfigDocument = {
    version: 1,
    issuer: 'https://mint.enbox.id',
    suite: 'RSABSSA-SHA384-PSS-Randomized',
    creditValueUsdCents: 25,
    mintDenominations: [
      { unit: 'c1', credits: 1 },
      { unit: 'c4', credits: 4 },
      { unit: 'c16', credits: 16 },
    ],
    tariffs: [
      { aud: 'dwn-cf-east', unit: 'storage-50mb-1yr', credits: 1 },
      { aud: 'dwn-cf-west', unit: 'storage-50mb-1yr', credits: 1 },
    ],
    currentEpoch: '2026-Q4',
    keys,
    issuedAt: '2026-10-01T00:00:00.000Z',
  };

  const suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW: false });
  const eastDescriptor: ServerBlindTokenDescriptor = {
    audience: 'dwn-cf-east',
    issuerUrls: ['https://mint.enbox.id'],
    units: [{ unit: 'storage-50mb-1yr', bytes: 50 * 1024 * 1024, durationSeconds: 31_536_000 }],
    registrationUrl: 'https://cf-east.dwn.enbox.id/registration',
    quotaUrl: 'https://cf-east.dwn.enbox.id/registration/quota',
  };
  const westDescriptor: ServerBlindTokenDescriptor = {
    audience: 'dwn-cf-west',
    issuerUrls: ['https://mint.enbox.id'],
    units: [{ unit: 'storage-50mb-1yr', bytes: 50 * 1024 * 1024, durationSeconds: 31_536_000 }],
    registrationUrl: 'https://cf-west.dwn.enbox.id/registration',
    quotaUrl: 'https://cf-west.dwn.enbox.id/registration/quota',
  };

  return { config, rsaKeys, suite, eastDescriptor, westDescriptor };
}

describe('blind-token-vault', () => {
  it('returns false from hasCreditsForEndpoint when agent.secrets is absent', async () => {
    const bareAgent = { agentDid: { uri: 'did:dht:agent' } };
    expect(
      await hasCreditsForEndpoint(bareAgent, {
        audience: 'dwn-cf-east',
        issuerUrls: ['https://mint.enbox.id'],
        units: [],
        registrationUrl: 'https://cf-east.dwn.enbox.id/registration',
        quotaUrl: 'https://cf-east.dwn.enbox.id/registration/quota',
      }),
    ).toBe(false);
  });

  it('claims invite credits, swaps on DWN registration, retains service tokens across 503, and clears 409', async () => {
    const agent = createMemorySecretAgent();
    const { config, suite, rsaKeys, eastDescriptor } = await makeBackendMock();
    let dwnMode: 'ok' | 'fail503' | 'conflict409' = 'fail503';
    let exchangeCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/.well-known/mint-config.json')) {
        return new Response(JSON.stringify(config), { status: 200 });
      }
      if (url.endsWith('/v1/invites/info')) {
        return new Response(
          JSON.stringify({ valid: true, credits: 4, remainingUses: 1, expiresAt: null }),
          { status: 200 },
        );
      }
      if (url.endsWith('/v1/invites/redeem') || url.endsWith('/v1/exchange')) {
        if (url.endsWith('/v1/exchange')) exchangeCalls += 1;
        const body = JSON.parse(String(init?.body)) as {
          outputs: Array<{ kid: string; blindedMsg: string }>;
        };
        const signatures = await Promise.all(
          body.outputs.map(async (out) => {
            const kp = rsaKeys.get(out.kid)!;
            const blindSig = await suite.blindSign(kp.privateKey, fromBase64Url(out.blindedMsg));
            return { kid: out.kid, blindSig: toBase64Url(blindSig) };
          }),
        );
        return new Response(JSON.stringify({ signatures }), { status: 200 });
      }
      if (url === 'https://cf-east.dwn.enbox.id/registration') {
        if (dwnMode === 'fail503') {
          return new Response(JSON.stringify({ code: 'UpstreamError', message: 'try again' }), { status: 503 });
        }
        if (dwnMode === 'conflict409') {
          return new Response(JSON.stringify({ code: 'TokenAlreadySpent', message: 'spent' }), { status: 409 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            grantedBytes: 50 * 1024 * 1024,
            totalStorageBytes: 50 * 1024 * 1024,
            activeLeases: 1,
          }),
          { status: 200 },
        );
      }
      return new Response('missing', { status: 404 });
    });

    const claimed = await claimAndStoreInvite(agent, {
      inviteCode: 'INV-4',
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(claimed.addedCredits).toBe(4);
    expect(claimed.summary.totalCredits).toBe(4);
    expect(agent._store.has(BLIND_TOKENS_SECRET_KEY)).toBe(true);
    expect(await hasCreditsForEndpoint(agent, eastDescriptor)).toBe(true);

    // Attempt 1 fails with 503: swaps c4 -> dwn-cf-east + 3xc1 change, retains unspent dwn-cf-east token.
    await expect(
      redeemStorageBlockForDid(agent, {
        did: 'did:dht:alice',
        endpoint: 'https://cf-east.dwn.enbox.id',
        descriptor: eastDescriptor,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/503/);

    expect(exchangeCalls).toBe(1);
    const after503 = await loadBlindTokenVault(agent);
    expect(after503.mintCredits.map((t) => parseKeyId(t.kid)?.unit)).toEqual(['c1', 'c1', 'c1']);
    expect(after503.serviceTokens['dwn-cf-east']).toHaveLength(1);

    // Retry succeeds on 200 OK WITHOUT another exchange call and removes the spent service token.
    dwnMode = 'ok';
    const registered = await redeemStorageBlockForDid(agent, {
      did: 'did:dht:alice',
      endpoint: 'https://cf-east.dwn.enbox.id',
      descriptor: eastDescriptor,
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(registered.grantedBytes).toBe(50 * 1024 * 1024);
    expect(exchangeCalls).toBe(1);

    const after200 = await getVaultSummary(agent);
    expect(after200.totalCredits).toBe(3);
    expect(after200.totalServiceTokenCount).toBe(0);

    // 409 TokenAlreadySpent removes the dead service token cleanly after failed submit.
    dwnMode = 'conflict409';
    await expect(
      redeemStorageBlockForDid(agent, {
        did: 'did:dht:alice',
        endpoint: 'https://cf-east.dwn.enbox.id',
        descriptor: eastDescriptor,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/409/);
    const after409 = await getVaultSummary(agent);
    expect(after409.totalCredits).toBe(2);
    expect(after409.totalServiceTokenCount).toBe(0);
  });

  it('serializes concurrent multi-endpoint registrations and supports refreshing credits', async () => {
    const agent = createMemorySecretAgent();
    const { config, suite, rsaKeys, eastDescriptor, westDescriptor } = await makeBackendMock();
    const exchangeInputsSeen = new Set<string>();

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/.well-known/mint-config.json')) {
        return new Response(JSON.stringify(config), { status: 200 });
      }
      if (url.endsWith('/v1/invites/info')) {
        return new Response(
          JSON.stringify({ valid: true, credits: 4, remainingUses: 1, expiresAt: null }),
          { status: 200 },
        );
      }
      if (url.endsWith('/v1/invites/redeem') || url.endsWith('/v1/exchange')) {
        const body = JSON.parse(String(init?.body)) as {
          inputs?: Array<{ kid: string; msg: string }>;
          outputs: Array<{ kid: string; blindedMsg: string }>;
        };
        if (url.endsWith('/v1/exchange') && body.inputs) {
          for (const inp of body.inputs) {
            if (exchangeInputsSeen.has(inp.msg)) {
              return new Response(JSON.stringify({ code: 'TokenAlreadySpent' }), { status: 409 });
            }
            exchangeInputsSeen.add(inp.msg);
          }
        }
        const signatures = await Promise.all(
          body.outputs.map(async (out) => {
            const kp = rsaKeys.get(out.kid)!;
            const blindSig = await suite.blindSign(kp.privateKey, fromBase64Url(out.blindedMsg));
            return { kid: out.kid, blindSig: toBase64Url(blindSig) };
          }),
        );
        return new Response(JSON.stringify({ signatures }), { status: 200 });
      }
      if (url.endsWith('/registration')) {
        return new Response(
          JSON.stringify({
            success: true,
            grantedBytes: 50 * 1024 * 1024,
            totalStorageBytes: 50 * 1024 * 1024,
            activeLeases: 1,
          }),
          { status: 200 },
        );
      }
      return new Response('missing', { status: 404 });
    });

    await claimAndStoreInvite(agent, {
      inviteCode: 'INV-CONCURRENT',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    // Register East and West simultaneously against one c4 credit note.
    const [eastRes, westRes] = await Promise.all([
      redeemStorageBlockForDid(agent, {
        did: 'did:dht:alice',
        endpoint: 'https://cf-east.dwn.enbox.id',
        descriptor: eastDescriptor,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
      redeemStorageBlockForDid(agent, {
        did: 'did:dht:alice',
        endpoint: 'https://cf-west.dwn.enbox.id',
        descriptor: westDescriptor,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    ]);

    expect(eastRes.registration.success).toBe(true);
    expect(westRes.registration.success).toBe(true);

    const summary = await refreshMintCredits(agent, {
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(summary.totalCredits).toBe(2);
    expect(summary.denominations).toEqual([
      { unit: 'c1', count: 2, creditsPerToken: 1, totalCredits: 2 },
    ]);
  });
});
