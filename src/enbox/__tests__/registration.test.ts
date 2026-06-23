import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect, Layer } from 'effect';
import { DwnRegistrar } from '@enbox/dwn-clients';

import { ensureRegistrationEffect, getStoredTokens, storeTokens } from '../registration';
import { runEnboxPromise } from '../effect/runtime';
import {
  RegistrationTokenStore,
  currentAgentLayer,
} from '../effect/services';
import type { RegistrationTokenData } from '../types';
import { STORAGE_KEYS } from '@/lib/constants';

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
        registrationRequirements: [],
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
) {
  return runEnboxPromise(
    ensureRegistrationEffect(endpoints).pipe(
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

  it('decodes persisted provider-auth tokens through Schema and falls back on invalid storage', () => {
    const endpoint = 'https://dwn.example';

    storeTokens({
      [endpoint]: {
        registrationToken : 'token',
        refreshToken      : 'refresh',
        expiresAt         : 123,
        tokenUrl          : 'https://provider.example/token',
        refreshUrl        : 'https://provider.example/refresh',
      },
    });

    expect(getStoredTokens()).toEqual({
      [endpoint]: {
        registrationToken : 'token',
        refreshToken      : 'refresh',
        expiresAt         : 123,
        tokenUrl          : 'https://provider.example/token',
        refreshUrl        : 'https://provider.example/refresh',
      },
    });

    localStorage.setItem(
      STORAGE_KEYS.REGISTRATION_TOKENS,
      '{"https://dwn.example":{"registrationToken":1}}',
    );

    expect(getStoredTokens()).toEqual({});
  });

  it('registers the agent DID and connected identity DIDs with proof-of-work registration', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();

    await runWithAgentAndStore(agent, tokenStore, ['https://dwn.example']);

    expect(agent.identity.list).toHaveBeenCalledOnce();
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

  it('retries transient server info failures before skipping an endpoint', async () => {
    const agent = createAgent();
    agent.rpc.getServerInfo
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({ registrationRequirements: [] });
    const tokenStore = createTokenStore();

    await runWithAgentAndStore(agent, tokenStore, ['https://dwn.example']);

    expect(agent.rpc.getServerInfo).toHaveBeenCalledTimes(2);
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith(
      'https://dwn.example',
      'did:dht:agent',
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
});
