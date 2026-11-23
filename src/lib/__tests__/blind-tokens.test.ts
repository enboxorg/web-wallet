import { describe, expect, it, vi } from 'vitest';
import { RSABSSA } from '@cloudflare/blindrsa-ts';

import {
  BlindTokenHttpError,
  buildDidPopHeader,
  chooseStorageUnit,
  claimInvite,
  decomposeCredits,
  exchangeTokens,
  fetchEndpointBlindTokenInfo,
  fetchEndpointQuota,
  formatKeyId,
  fromBase64Url,
  type MintConfigDocument,
  parseKeyId,
  selectMintInputs,
  type ServerBlindTokenDescriptor,
  toBase64Url,
} from '../blind-tokens';

async function makeMintFixture() {
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

  return { config, rsaKeys };
}

describe('blind-tokens', () => {
  it('parses and formats key IDs and decomposes credits', () => {
    const kid = formatKeyId('dwn-cf-east', 'storage-50mb-1yr', '2026-Q4');
    expect(kid).toBe('dwn-cf-east:storage-50mb-1yr:2026-Q4');
    expect(parseKeyId(kid)).toEqual({
      kid,
      aud: 'dwn-cf-east',
      unit: 'storage-50mb-1yr',
      epoch: '2026-Q4',
    });
    expect(parseKeyId('invalid-kid')).toBeNull();

    const denoms = [
      { unit: 'c1', credits: 1 },
      { unit: 'c4', credits: 4 },
      { unit: 'c16', credits: 16 },
    ];
    expect(decomposeCredits(21, denoms).map((d) => d.unit)).toEqual(['c16', 'c4', 'c1']);
    expect(decomposeCredits(0, denoms)).toEqual([]);
  });

  it('selects tight coin inputs for exact and change-requiring targets', () => {
    const denoms = [
      { unit: 'c1', credits: 1 },
      { unit: 'c4', credits: 4 },
      { unit: 'c16', credits: 16 },
    ];
    const mk = (unit: string, id: string) => ({
      kid: `mint:${unit}:2026-Q4`,
      msg: id,
      sig: 'sig',
    });

    const wallet = [mk('c16', 'a'), mk('c4', 'b'), mk('c1', 'c'), mk('c4', 'd')];

    expect(selectMintInputs(wallet, 1, denoms).map((t) => t.msg)).toEqual(['c']);
    expect(selectMintInputs(wallet, 5, denoms).map((t) => t.kid)).toEqual([
      'mint:c1:2026-Q4',
      'mint:c4:2026-Q4',
    ]);
    expect(selectMintInputs(wallet, 8, denoms).map((t) => t.kid)).toEqual([
      'mint:c4:2026-Q4',
      'mint:c4:2026-Q4',
    ]);
    expect(selectMintInputs([mk('c4', 'only4')], 1, denoms).map((t) => t.msg)).toEqual(['only4']);
    expect(() => selectMintInputs([mk('c1', 'only1')], 5, denoms)).toThrow(/Insufficient credits/);
  });

  it('claims an invite via RSABSSA blind signature and swaps into a single service audience + change', async () => {
    const { config, rsaKeys } = await makeMintFixture();
    const suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW: false });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/.well-known/mint-config.json')) {
        return new Response(JSON.stringify(config), { status: 200 });
      }
      if (url.endsWith('/v1/invites/info')) {
        return new Response(
          JSON.stringify({ valid: true, credits: 5, remainingUses: 1, expiresAt: null }),
          { status: 200 },
        );
      }
      if (url.endsWith('/v1/invites/redeem') || url.endsWith('/v1/exchange')) {
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
      return new Response('not found', { status: 404 });
    });

    const claimed = await claimInvite({
      mintUrl: 'https://mint.enbox.id',
      inviteCode: 'TEST-CODE',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(claimed.credits).toBe(5);
    expect(claimed.tokens.map((t) => parseKeyId(t.kid)?.unit)).toEqual(['c4', 'c1']);

    // Verify finalized RSA-PSS signatures locally against issuer public keys.
    for (const token of claimed.tokens) {
      const kp = rsaKeys.get(token.kid)!;
      const valid = await suite.verify(
        kp.publicKey,
        fromBase64Url(token.sig),
        fromBase64Url(token.msg),
      );
      expect(valid).toBe(true);
    }

    // Exchange c4 for 1 storage-50mb-1yr token on dwn-cf-east + 3 x c1 change.
    const swapped = await exchangeTokens({
      mintUrl: 'https://mint.enbox.id',
      inputs: [claimed.tokens[0]!],
      targetOutputs: [{ aud: 'dwn-cf-east', unit: 'storage-50mb-1yr', count: 1 }],
      config,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(swapped.tokens).toHaveLength(1);
    expect(swapped.tokens[0]!.kid).toBe('dwn-cf-east:storage-50mb-1yr:2026-Q4');
    expect(swapped.change).toHaveLength(3);
    expect(swapped.change.every((t) => t.kid === 'mint:c1:2026-Q4')).toBe(true);
  });

  it('rejects swaps spanning more than one non-mint target service audience', async () => {
    const { config } = await makeMintFixture();
    await expect(
      exchangeTokens({
        mintUrl: 'https://mint.enbox.id',
        inputs: [{ kid: 'mint:c4:2026-Q4', msg: 'm', sig: 's' }],
        targetOutputs: [
          { aud: 'dwn-cf-east', unit: 'storage-50mb-1yr' },
          { aud: 'dwn-cf-west', unit: 'storage-50mb-1yr' },
        ],
        config,
      }),
    ).rejects.toThrow(/at most one target service audience/);
  });

  it('chooses a matching supported storage tariff for an endpoint descriptor', async () => {
    const { config } = await makeMintFixture();
    const descriptor: ServerBlindTokenDescriptor = {
      audience: 'dwn-cf-east',
      issuerUrls: ['https://mint.enbox.id'],
      units: [
        { unit: 'storage-10mb-1yr', bytes: 10 * 1024 * 1024, durationSeconds: 31536000 },
        { unit: 'storage-50mb-1yr', bytes: 50 * 1024 * 1024, durationSeconds: 31536000 },
      ],
      registrationUrl: 'https://cf-east.dwn.enbox.id/registration',
      quotaUrl: 'https://cf-east.dwn.enbox.id/registration/quota',
    };

    const chosen = chooseStorageUnit(config, descriptor);
    expect(chosen.tariff.unit).toBe('storage-50mb-1yr');
    expect(chosen.tariff.credits).toBe(1);
  });

  it('builds valid DID-PoP Authorization headers and fetches endpoint quota and /info', async () => {
    const didUri = 'did:dht:alice123';
    const signMock = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
    const agent = {
      agentDid: { uri: 'did:dht:agent' },
      identity: {
        get: vi.fn(async () => ({
          did: {
            getSigner: async () => ({
              algorithm: 'EdDSA',
              keyId: '#sig-0',
              sign: signMock,
            }),
          },
        })),
      },
    };

    const header = await buildDidPopHeader({
      didUri,
      audience: 'https://cf-east.dwn.enbox.id/',
      agent,
      nowMs: 1_700_000_000_000,
    });

    expect(header.startsWith('DID-PoP ')).toBe(true);
    const jwt = header.slice('DID-PoP '.length);
    const [hdrB64, payB64, sigB64] = jwt.split('.');
    const parsedHdr = JSON.parse(new TextDecoder().decode(fromBase64Url(hdrB64!)));
    const parsedPay = JSON.parse(new TextDecoder().decode(fromBase64Url(payB64!)));
    expect(parsedHdr).toEqual({ alg: 'EdDSA', kid: 'did:dht:alice123#sig-0', typ: 'dwn-pop+jwt' });
    expect(parsedPay).toEqual({
      iss: didUri,
      sub: didUri,
      aud: 'https://cf-east.dwn.enbox.id',
      scope: 'registration.quota',
      iat: 1_700_000_000,
      exp: 1_700_000_120,
    });
    expect(fromBase64Url(sigB64!)).toEqual(new Uint8Array([1, 2, 3, 4]));

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://cf-east.dwn.enbox.id/registration/quota') {
        expect((init?.headers as Record<string, string>).authorization).toContain('DID-PoP ');
        return new Response(
          JSON.stringify({
            did: didUri,
            registered: true,
            suspended: false,
            quotaEnforced: true,
            storage: {
              usedBytes: 1024,
              limitBytes: 52_428_800,
              remainingBytes: 52_427_776,
              messageCount: 1,
              maxMessages: 0,
            },
            leases: [],
          }),
          { status: 200 },
        );
      }
      if (url === 'https://cf-east.dwn.enbox.id/info') {
        return new Response(
          JSON.stringify({
            registrationRequirements: ['blind-token-v1'],
            blindToken: {
              audience: 'dwn-cf-east',
              issuerUrls: ['https://mint.enbox.id'],
              units: [],
              registrationUrl: 'https://cf-east.dwn.enbox.id/registration',
              quotaUrl: 'https://cf-east.dwn.enbox.id/registration/quota',
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ code: 'NotFound', message: 'missing' }), { status: 404 });
    });

    const quota = await fetchEndpointQuota({
      endpoint: 'https://cf-east.dwn.enbox.id',
      didUri,
      agent,
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(quota.storage.limitBytes).toBe(52_428_800);

    const info = await fetchEndpointBlindTokenInfo('https://cf-east.dwn.enbox.id/', {
      fetchFn: fetchMock as unknown as typeof fetch,
    });
    expect(info.blindToken?.audience).toBe('dwn-cf-east');

    await expect(
      fetchEndpointQuota({
        endpoint: 'https://cf-east.dwn.enbox.id',
        didUri,
        quotaUrl: 'https://cf-east.dwn.enbox.id/missing',
        agent,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(BlindTokenHttpError);
  });
});
