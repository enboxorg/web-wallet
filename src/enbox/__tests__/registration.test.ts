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

  it('retries transient server info failures before skipping an endpoint', async () => {
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

  it('fails when no configured endpoint accepts the DID registration', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();
    vi.mocked(DwnRegistrar.registerTenant).mockRejectedValue(new Error('registration rejected'));

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://dwn.example'],
    )).rejects.toThrow('Unable to register did:dht:agent with any configured DWN endpoint');
  });

  it('succeeds when at least one configured endpoint accepts the DID', async () => {
    const agent = createAgent();
    const tokenStore = createTokenStore();
    vi.mocked(DwnRegistrar.registerTenant)
      .mockRejectedValueOnce(new Error('first endpoint rejected'))
      .mockResolvedValueOnce(undefined as never);

    await expect(runWithAgentAndStore(
      agent,
      tokenStore,
      ['https://dwn-a.example', 'https://dwn-b.example'],
    )).resolves.toEqual({ failed: 1, succeeded: 1 });
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
    )).rejects.toThrow('Unable to register did:dht:bob with any configured DWN endpoint');
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
