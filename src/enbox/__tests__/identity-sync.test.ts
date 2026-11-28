import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import { reconcileIdentitySync } from '../identity-sync';

const mocks = vi.hoisted(() => ({
  installModules: vi.fn(),
}));

vi.mock('../modules', () => ({
  IDENTITY_SYNC_MODULES: [
    'https://identity.foundation/modules/profile',
    'https://identity.foundation/modules/connect',
    'https://identity.foundation/modules/service-config',
  ],
  installModulesEffect: mocks.installModules,
}));

const desiredModules = [
  'https://identity.foundation/modules/profile',
  'https://identity.foundation/modules/connect',
  'https://identity.foundation/modules/service-config',
];

function createAgent(optionsChanged = true) {
  return {
    sync: {
      ensureIdentityOptions: vi.fn().mockResolvedValue(optionsChanged),
      sync: vi.fn(),
    },
  };
}

describe('reconcileIdentitySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.installModules.mockImplementation(() => Effect.void);
  });

  it('registers a newly discovered identity for scoped sync without driving a manual pull', async () => {
    const identity = { did: { uri: 'did:dht:new' }, metadata: { name: 'New' } };
    const agent = createAgent();

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:new',
      options: { modules: desiredModules },
    });
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installModules).toHaveBeenCalledWith('did:dht:new');
    expect(result.changedDids).toEqual(['did:dht:new']);
  });

  it('reports no change when the SDK finds an equivalent sync scope', async () => {
    const identity = { did: { uri: 'did:dht:known' }, metadata: { name: 'Known' } };
    const agent = createAgent(false);

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:known',
      options: { modules: desiredModules },
    });
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installModules).toHaveBeenCalledWith('did:dht:known');
    expect(result.changedDids).toEqual([]);
  });

  it('leaves delegated sync registration to the SDK grant lifecycle', async () => {
    const identity = {
      did: { uri: 'did:dht:delegate' },
      metadata: { connectedDid: 'did:dht:owner' },
    };
    const agent = createAgent();

    await reconcileIdentitySync(agent, [identity]);

    expect(mocks.installModules).not.toHaveBeenCalled();
    expect(agent.sync.ensureIdentityOptions).not.toHaveBeenCalled();
  });

  it('reconciles an owner once when a delegated identity references the same DID', async () => {
    const agent = createAgent();

    const result = await reconcileIdentitySync(agent, [
      {
        did: { uri: 'did:dht:delegate' },
        metadata: { connectedDid: 'did:dht:owner' },
      },
      { did: { uri: 'did:dht:owner' } },
    ]);

    expect(mocks.installModules).toHaveBeenCalledOnce();
    expect(mocks.installModules).toHaveBeenCalledWith('did:dht:owner');
    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledOnce();
    expect(result.changedDids).toEqual(['did:dht:owner']);
  });

  it('continues reconciling later identities when one sync registration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const agent = createAgent();
    agent.sync.ensureIdentityOptions.mockImplementation(async ({ did }: { did: string }) => {
      if (did === 'did:dht:bad') {
        throw new Error('sync registration failed');
      }
      return true;
    });

    const result = await reconcileIdentitySync(agent, [
      { did: { uri: 'did:dht:bad' }, metadata: { name: 'Bad' } },
      { did: { uri: 'did:dht:good' }, metadata: { name: 'Good' } },
    ]);

    expect(result).toEqual({
      changedDids: ['did:dht:good'],
      failedDids: ['did:dht:bad'],
    });
    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:good',
      options: { modules: desiredModules },
    });
    warn.mockRestore();
  });

  it('skips exclusive ensureIdentityOptions lock when getIdentityOptions already matches', async () => {
    const identity = { did: { uri: 'did:dht:already-synced' }, metadata: { name: 'Synced' } };
    const agent = {
      sync: {
        getIdentityOptions: vi.fn().mockResolvedValue({
          modules: [...desiredModules].reverse(),
        }),
        ensureIdentityOptions: vi.fn().mockResolvedValue(false),
        sync: vi.fn(),
      },
    };

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(agent.sync.getIdentityOptions).toHaveBeenCalledWith('did:dht:already-synced');
    expect(agent.sync.ensureIdentityOptions).not.toHaveBeenCalled();
    expect(result).toEqual({ changedDids: [], failedDids: [] });
  });

  it('still calls ensureIdentityOptions when existing options are delegated or missing modules', async () => {
    const agent = {
      sync: {
        getIdentityOptions: vi.fn().mockResolvedValue({
          delegateDid: 'did:jwk:old-delegate',
          modules: desiredModules,
        }),
        ensureIdentityOptions: vi.fn().mockResolvedValue(true),
        sync: vi.fn(),
      },
    };

    const result = await reconcileIdentitySync(agent, [
      { did: { uri: 'did:dht:owner' }, metadata: { name: 'Owner' } },
    ]);

    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledOnce();
    expect(result).toEqual({ changedDids: ['did:dht:owner'], failedDids: [] });
  });

  it('repairs empty or malformed persisted module lists instead of failing with a defect', async () => {
    const agent = {
      sync: {
        getIdentityOptions: vi.fn().mockResolvedValue({ modules: [] }),
        ensureIdentityOptions: vi.fn().mockResolvedValue(true),
        sync: vi.fn(),
      },
    };

    const result = await reconcileIdentitySync(agent, [
      { did: { uri: 'did:dht:corrupt' }, metadata: { name: 'Corrupt' } },
    ]);

    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledOnce();
    expect(result).toEqual({ changedDids: ['did:dht:corrupt'], failedDids: [] });
  });
});
