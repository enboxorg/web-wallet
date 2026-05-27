import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIdentity, importIdentity } from '../identity-mutations';

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const connectProtocol = Symbol('ConnectProtocol');

  const profileRecord = {
    contextId: 'profile-context',
    send: vi.fn(async () => { calls.push('profile:send'); }),
  };
  const walletRecord = {
    send: vi.fn(async () => { calls.push('wallet:send'); }),
  };
  const profileRepo = {
    profile: {
      set: vi.fn(async () => {
        calls.push('profile:set');
        return { record: profileRecord };
      }),
      avatar: {
        set: vi.fn(),
        get: vi.fn(),
      },
      hero: {
        set: vi.fn(),
        get: vi.fn(),
      },
    },
  };
  const connectApi = {
    records: {
      query: vi.fn(async () => ({ records: [] })),
      create: vi.fn(async () => {
        calls.push('wallet:create');
        return { record: walletRecord };
      }),
    },
  };

  return {
    calls,
    connectProtocol,
    connectApi,
    profileRepo,
    profileRecord,
    walletRecord,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
      using: vi.fn((protocol) => protocol === connectProtocol ? connectApi : protocol),
      };
    }),
    repository: vi.fn(() => profileRepo),
    ensureRegistration: vi.fn(async () => { calls.push('registration:ensure'); }),
    installProtocols: vi.fn(async () => { calls.push('protocols:install'); }),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
  repository: mocks.repository,
}));

vi.mock('@enbox/protocols', () => ({
  ProfileProtocol: Symbol('ProfileProtocol'),
  ConnectProtocol: mocks.connectProtocol,
  SocialGraphDefinition: { protocol: 'https://identity.foundation/protocols/social-graph' },
  ProfileDefinition: { protocol: 'https://identity.foundation/protocols/profile' },
  ConnectDefinition: { protocol: 'https://identity.foundation/protocols/connect' },
}));

vi.mock('../../protocols', () => ({
  installProtocols: mocks.installProtocols,
}));

vi.mock('../../registration', () => ({
  ensureRegistration: mocks.ensureRegistration,
}));

vi.mock('@/lib/dwn-endpoints', () => ({
  DEFAULT_DWN_ENDPOINTS: ['https://aws.example/dwn', 'https://fly.example/dwn'],
  WALLET_URL: 'https://wallet.example',
}));

function createAgent(did = 'did:dht:new') {
  return {
    agentDid: { uri: 'did:dht:agent' },
    identity: {
      create: vi.fn(async () => {
        mocks.calls.push('identity:create');
        return { did: { uri: did } };
      }),
      get: vi.fn(async () => undefined),
      import: vi.fn(async () => {
        mocks.calls.push('identity:import');
        return { did: { uri: did } };
      }),
    },
    sync: {
      registerIdentity: vi.fn(async () => { mocks.calls.push('sync:register'); }),
    },
  };
}

describe('identity mutations', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    vi.clearAllMocks();
  });

  it('bootstraps protocols on every endpoint before live sync and profile writes', async () => {
    const did = 'did:dht:new';
    const dwnEndpoints = ['https://aws.example/dwn', 'https://fly.example/dwn'];
    const agent = createAgent(did);

    await createIdentity(agent, {
      persona: 'Personal',
      displayName: 'Alice',
      dwnEndpoints,
    });

    expect(mocks.installProtocols).toHaveBeenCalledWith(agent, did, dwnEndpoints);
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did,
      options: {
        protocols: [
          'https://identity.foundation/protocols/social-graph',
          'https://identity.foundation/protocols/profile',
          'https://identity.foundation/protocols/connect',
        ],
      },
    });
    expect(mocks.calls).toEqual([
      'identity:create',
      'registration:ensure',
      'protocols:install',
      'sync:register',
      'profile:set',
      'profile:send',
      'wallet:create',
      'wallet:send',
    ]);
  });

  it('uses the same protocol-before-sync bootstrap when importing an identity', async () => {
    const did = 'did:dht:imported';
    const agent = createAgent(did);

    await importIdentity(agent, { portableDid: { uri: did } });

    expect(mocks.installProtocols).toHaveBeenCalledWith(agent, did, [
      'https://aws.example/dwn',
      'https://fly.example/dwn',
    ]);
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did,
      options: {
        protocols: [
          'https://identity.foundation/protocols/social-graph',
          'https://identity.foundation/protocols/profile',
          'https://identity.foundation/protocols/connect',
        ],
      },
    });
    expect(mocks.calls).toEqual([
      'identity:import',
      'registration:ensure',
      'protocols:install',
      'sync:register',
      'wallet:create',
      'wallet:send',
    ]);
  });
});
