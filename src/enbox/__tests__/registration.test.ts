import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { DwnRegistrar } from '@enbox/dwn-clients';

import { ensureRegistrationEffect } from '../registration';
import { runEnboxPromise } from '../effect/runtime';
import {
  RegistrationTokenStore,
  currentAgentLayer,
} from '../effect/services';
import type { RegistrationTokenData } from '../types';

vi.mock('@enbox/dwn-clients', () => ({
  DwnRegistrar: {
    registerTenant: vi.fn(),
    registerTenantWithToken: vi.fn(),
    exchangeAuthCode: vi.fn(),
    refreshRegistrationToken: vi.fn(),
  },
}));

function createAgent() {
  return {
    agentDid: { uri: 'did:dht:agent' },
    identity: {
      list: vi.fn(async () => [
        {
          did: { uri: 'did:dht:delegate' },
          metadata: { connectedDid: 'did:dht:owner' },
        },
        {
          did: { uri: 'did:dht:bob' },
          metadata: {},
        },
      ]),
    },
    rpc: {
      getServerInfo: vi.fn(async () => ({
        registrationRequirements: ['proof-of-work-sha256-v0'],
      })),
    },
  };
}

function createTokenStore(initial: Record<string, RegistrationTokenData> = {}) {
  let stored = { ...initial };
  const set = vi.fn((next: Record<string, RegistrationTokenData>) =>
    Effect.sync(() => {
      stored = { ...next };
    })
  );

  return {
    get stored() {
      return stored;
    },
    set,
    layer: Layer.succeed(RegistrationTokenStore, {
      get: Effect.sync(() => ({ ...stored })),
      set,
    }),
  };
}

async function runWithAgentAndStore(
  agent: ReturnType<typeof createAgent>,
  tokenStore: ReturnType<typeof createTokenStore>,
  endpoints: string[],
  dids: string[] = ['did:dht:agent'],
) {
  return runEnboxPromise(
    ensureRegistrationEffect(endpoints, dids).pipe(
      Effect.provide(Layer.merge(currentAgentLayer(agent), tokenStore.layer)),
    ),
  );
}

describe('ensureRegistrationEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(DwnRegistrar.registerTenant).mockResolvedValue(undefined as never);
    vi.mocked(DwnRegistrar.registerTenantWithToken).mockResolvedValue(undefined as never);
  });

  it('registers only the supplied DIDs with proof-of-work registration', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();

    await runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://dwn.example'],
      ['did:dht:agent', 'did:dht:owner', 'did:dht:bob'],
    );

    expect(agent.identity.list).not.toHaveBeenCalled();
    expect(agent.rpc.getServerInfo).toHaveBeenCalledWith('https://dwn.example');
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://dwn.example',
      'did:dht:agent',
    );
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://dwn.example',
      'did:dht:owner',
    );
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://dwn.example',
      'did:dht:bob',
    );
    expect(tokenStore.set).toHaveBeenCalledWith({});
  });

  it('registers only explicit owner DIDs at request-supplied endpoints', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();

    await runEnboxPromise(
      ensureRegistrationEffect(['https://requester-dwn.example'], ['did:dht:imported']).pipe(
        Effect.provide(Layer.merge(currentAgentLayer(agent), tokenStore.layer)),
      ),
    );

    expect(agent.identity.list).not.toHaveBeenCalled();
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledTimes(1);
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://requester-dwn.example',
      'did:dht:imported',
    );
  });

  it('joins concurrent registration for the same agent, DID, and endpoint', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();
    let releaseRegistration!: () => void;
    const registrationGate = new Promise<void>((resolve) => {
      releaseRegistration = resolve;
    });
    vi.mocked(DwnRegistrar.registerTenant).mockImplementation(() => registrationGate);

    const first = runWithAgentAndStore(agent, tokenStore, ['https://dwn.example']);
    const second = runWithAgentAndStore(agent, tokenStore, ['https://dwn.example']);

    await vi.waitFor(() => {
      expect(DwnRegistrar.registerTenant).toHaveBeenCalledTimes(1);
    });
    releaseRegistration();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { failed: 0, succeeded: 1 },
      { failed: 0, succeeded: 1 },
    ]);
  });

  it('treats an endpoint with no registration requirements as ready', async () => {
    const agent = createAgent();
    agent.rpc.getServerInfo.mockResolvedValue({ registrationRequirements: [] });
    const tokenStore = createTokenStore();

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://open-dwn.example'],
    )).resolves.toEqual({ failed: 0, succeeded: 1 });

    expect(DwnRegistrar.registerTenant).not.toHaveBeenCalled();
    expect(DwnRegistrar.registerTenantWithToken).not.toHaveBeenCalled();
  });

  it('retries transient server info failures before registering an endpoint', async () => {
    const agent = createAgent();
    agent.rpc.getServerInfo
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ registrationRequirements: ['proof-of-work-sha256-v0'] });
    const tokenStore = createTokenStore();

    await runWithAgentAndStore(agent, tokenStore, ['https://dwn.example']);

    expect(agent.rpc.getServerInfo).toHaveBeenCalledTimes(2);
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://dwn.example',
      'did:dht:agent',
    );
  });

  it('fails closed when server info remains unavailable for an endpoint', async () => {
    const agent = createAgent();
    agent.rpc.getServerInfo.mockRejectedValue(new Error('network unavailable'));
    const tokenStore = createTokenStore();

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://offline.example'],
      ['did:dht:alice', 'did:dht:bob'],
    )).rejects.toThrow(
      'did:dht:alice with https://offline.example, did:dht:bob with https://offline.example',
    );

    expect(DwnRegistrar.registerTenant).not.toHaveBeenCalled();
  });

  it('fails when no configured endpoint accepts the DID registration', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();
    vi.mocked(DwnRegistrar.registerTenant).mockRejectedValue(new Error('registration rejected'));

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://dwn.example'],
    )).rejects.toThrow(
      'Unable to register every requested tenant; failed: did:dht:agent with https://dwn.example.',
    );
  });

  it('fails when any configured endpoint rejects the DID', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();
    vi.mocked(DwnRegistrar.registerTenant)
      .mockRejectedValueOnce(new Error('first endpoint rejected'))
      .mockResolvedValueOnce(undefined as never);

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://dwn-a.example', 'https://dwn-b.example'],
    )).rejects.toThrow(
      'Unable to register every requested tenant; failed: did:dht:agent with https://dwn-a.example.',
    );
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://dwn-b.example',
      'did:dht:agent',
    );
  });

  it('fails a bulk request when any supplied DID has no successful endpoint', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();
    vi.mocked(DwnRegistrar.registerTenant).mockImplementation(async (_endpoint, did) => {
      if (did === 'did:dht:bob') {
        throw new Error('bob rejected');
      }
    });

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://dwn.example'],
      ['did:dht:alice', 'did:dht:bob'],
    )).rejects.toThrow(
      'Unable to register every requested tenant; failed: did:dht:bob with https://dwn.example.',
    );
  });

  it('refreshes expired provider-auth tokens through the injected token store', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const endpoint = 'https://provider.example/dwn';
    const agent = createAgent();
    agent.rpc.getServerInfo.mockResolvedValue({
      registrationRequirements: ['provider-auth-v0'],
      providerAuth: {
        authorizeUrl: 'https://provider.example/authorize',
        tokenUrl: 'https://provider.example/token',
        refreshUrl: 'https://provider.example/refresh',
      },
    });
    vi.mocked(DwnRegistrar.refreshRegistrationToken).mockResolvedValue({
      registrationToken: 'token-new',
      refreshToken: 'refresh-new',
      expiresIn: 60,
    } as never);

    const tokenStore = createTokenStore({
      [endpoint]: {
        registrationToken: 'token-old',
        refreshToken: 'refresh-old',
        expiresAt: 1,
        tokenUrl: 'https://provider.example/token',
        refreshUrl: 'https://provider.example/refresh',
      },
    });

    await runWithAgentAndStore(agent, tokenStore, [endpoint]);

    expect(DwnRegistrar.refreshRegistrationToken).toHaveBeenCalledWith(
      'https://provider.example/refresh',
      'refresh-old',
    );
    expect(DwnRegistrar.registerTenantWithToken).toHaveBeenCalledWith(
      endpoint,
      'did:dht:agent',
      'token-new',
    );
    expect(tokenStore.stored[endpoint]).toMatchObject({
      registrationToken: 'token-new',
      refreshToken: 'refresh-new',
      expiresAt: 70_000,
    });
  });

  it('falls back to provider-auth-v0 on dual-mode endpoints when the wallet holds no credits', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const endpoint = 'https://cf-dual.example';
    const agent = createAgent();
    agent.rpc.getServerInfo.mockResolvedValue({
      registrationRequirements: ['provider-auth-v0', 'blind-token-v1'],
      providerAuth: {
        authorizeUrl: 'https://cf-dual.example/authorize',
        tokenUrl: 'https://cf-dual.example/token',
      },
      blindToken: {
        audience: 'dwn-cf-east',
        issuerUrls: ['https://mint.enbox.id'],
        units: [{ unit: 'storage-50mb-1yr', bytes: 52_428_800, durationSeconds: 31_536_000 }],
        registrationUrl: 'https://cf-dual.example/registration',
        quotaUrl: 'https://cf-dual.example/registration/quota',
      },
    });

    const tokenStore = createTokenStore({
      [endpoint]: {
        registrationToken: 'open-auth-token',
        expiresAt: 1_000_000,
        tokenUrl: 'https://cf-dual.example/token',
      },
    });

    await runWithAgentAndStore(agent, tokenStore, [endpoint]);

    expect(DwnRegistrar.registerTenantWithToken).toHaveBeenCalledWith(
      endpoint,
      'did:dht:agent',
      'open-auth-token',
    );
  });

  it('fails clearly on blind-token-only endpoints when no credits are held', async () => {
    const endpoint = 'https://cf-paid.example';
    const agent = createAgent();
    agent.rpc.getServerInfo.mockResolvedValue({
      registrationRequirements: ['blind-token-v1'],
      blindToken: {
        audience: 'dwn-cf-east',
        issuerUrls: ['https://mint.enbox.id'],
        units: [{ unit: 'storage-50mb-1yr', bytes: 52_428_800, durationSeconds: 31_536_000 }],
        registrationUrl: 'https://cf-paid.example/registration',
        quotaUrl: 'https://cf-paid.example/registration/quota',
      },
    });

    let caught: unknown;
    try {
      await runWithAgentAndStore(agent, createTokenStore(), [endpoint]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { cause?: { failures?: Array<{ operation?: string; message?: string }> } };
    expect(err.message).toMatch(/Unable to register every requested tenant/);
    expect(err.cause?.failures?.[0]?.operation).toBe('tenant.registerWithBlindToken');
    expect(err.cause?.failures?.[0]?.message).toMatch(/Storage credits are required/);
  });

  it('registers via blind-token-v1 (even when getServerInfo omits blindToken) when credits exist', async () => {
    const { RSABSSA } = await import('@cloudflare/blindrsa-ts');
    const {
      clearEndpointBlindTokenCache,
      formatKeyId,
      fromBase64Url,
      toBase64Url,
    } = await import('@/lib/blind-tokens');
    const { BLIND_TOKENS_SECRET_KEY } = await import('../blind-token-vault');

    clearEndpointBlindTokenCache();

    const suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW: false });
    const mintKp = await RSABSSA.SHA384.generateKey({
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    });
    const svcKp = await RSABSSA.SHA384.generateKey({
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
    });
    const mintJwk = await crypto.subtle.exportKey('jwk', mintKp.publicKey);
    const svcJwk = await crypto.subtle.exportKey('jwk', svcKp.publicKey);

    const endpoint = 'https://cf-east.example';
    const config = {
      version: 1,
      issuer: 'https://mint.enbox.id',
      suite: 'RSABSSA-SHA384-PSS-Randomized',
      creditValueUsdCents: 25,
      mintDenominations: [{ unit: 'c1', credits: 1 }],
      tariffs: [{ aud: 'dwn-cf-east', unit: 'storage-50mb-1yr', credits: 1 }],
      currentEpoch: '2026-Q4',
      keys: [
        {
          kty: 'RSA',
          n: mintJwk.n!,
          e: mintJwk.e!,
          alg: 'PS384',
          use: 'sig',
          kid: formatKeyId('mint', 'c1', '2026-Q4'),
          aud: 'mint',
          unit: 'c1',
          epoch: '2026-Q4',
          notAfter: '2027-01-01T00:00:00.000Z',
          redeemBefore: '2028-01-01T00:00:00.000Z',
          active: true,
        },
        {
          kty: 'RSA',
          n: svcJwk.n!,
          e: svcJwk.e!,
          alg: 'PS384',
          use: 'sig',
          kid: formatKeyId('dwn-cf-east', 'storage-50mb-1yr', '2026-Q4'),
          aud: 'dwn-cf-east',
          unit: 'storage-50mb-1yr',
          epoch: '2026-Q4',
          notAfter: '2027-01-01T00:00:00.000Z',
          redeemBefore: '2028-01-01T00:00:00.000Z',
          active: true,
        },
      ],
      issuedAt: '2026-10-01T00:00:00.000Z',
    };

    const secretMap = new Map<string, Uint8Array>();
    secretMap.set(
      BLIND_TOKENS_SECRET_KEY,
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          mintUrl: 'https://mint.enbox.id',
          mintCredits: [
            {
              kid: 'mint:c1:2026-Q4',
              msg: 'dGVzdA',
              sig: 'c2ln',
              credits: 1,
              addedAt: '2026-11-23T00:00:00.000Z',
            },
          ],
          serviceTokens: {},
        }),
      ),
    );

    const agent = createAgent() as ReturnType<typeof createAgent> & {
      secrets: { get: (k: string) => Promise<Uint8Array | undefined>; put: (k: string, v: Uint8Array) => Promise<void> };
    };
    agent.secrets = {
      get: async (k: string) => secretMap.get(k),
      put: async (k: string, v: Uint8Array) => {
        secretMap.set(k, v);
      },
    };

    // Mimic @enbox/dwn-clients HttpDwnRpcClient stripping `blindToken` from getServerInfo.
    agent.rpc.getServerInfo.mockResolvedValue({
      registrationRequirements: ['provider-auth-v0', 'blind-token-v1'],
      providerAuth: {
        authorizeUrl: `${endpoint}/authorize`,
        tokenUrl: `${endpoint}/token`,
      },
    });

    const regPayloads: unknown[] = [];
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${endpoint}/info`) {
        return new Response(
          JSON.stringify({
            registrationRequirements: ['provider-auth-v0', 'blind-token-v1'],
            blindToken: {
              audience: 'dwn-cf-east',
              issuerUrls: ['https://mint.enbox.id'],
              units: [{ unit: 'storage-50mb-1yr', bytes: 52_428_800, durationSeconds: 31_536_000 }],
              registrationUrl: `${endpoint}/registration`,
              quotaUrl: `${endpoint}/registration/quota`,
            },
          }),
          { status: 200 },
        );
      }
      if (url === 'https://mint.enbox.id/.well-known/mint-config.json') {
        return new Response(JSON.stringify(config), { status: 200 });
      }
      if (url === 'https://mint.enbox.id/v1/exchange') {
        const body = JSON.parse(String(init?.body)) as { outputs: Array<{ kid: string; blindedMsg: string }> };
        const signatures = await Promise.all(
          body.outputs.map(async (out) => ({
            kid: out.kid,
            blindSig: toBase64Url(await suite.blindSign(svcKp.privateKey, fromBase64Url(out.blindedMsg))),
          })),
        );
        return new Response(JSON.stringify({ signatures }), { status: 200 });
      }
      if (url === `${endpoint}/registration`) {
        regPayloads.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            success: true,
            grantedBytes: 52_428_800,
            totalStorageBytes: 52_428_800,
            activeLeases: 1,
          }),
          { status: 200 },
        );
      }
      return new Response('missing', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchSpy);
    try {
      await runWithAgentAndStore(agent, createTokenStore(), [endpoint]);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(DwnRegistrar.registerTenantWithToken).not.toHaveBeenCalled();
    expect(regPayloads).toHaveLength(1);
    expect(regPayloads[0]).toMatchObject({
      registrationData: { did: 'did:dht:agent' },
      blindTokens: [{ kid: 'dwn-cf-east:storage-50mb-1yr:2026-Q4' }],
    });
  });
});
