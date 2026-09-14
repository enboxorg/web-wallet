import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import { reconcileIdentitySync } from '../identity-sync';

const mocks = vi.hoisted(() => ({
  installProtocols: vi.fn(),
}));

vi.mock('../protocols', () => ({
  IDENTITY_SYNC_PROTOCOLS: [
    'https://identity.foundation/protocols/profile',
    'https://identity.foundation/protocols/connect',
    'https://identity.foundation/protocols/service-config',
  ],
  installProtocolsEffect: mocks.installProtocols,
}));

const desiredProtocols = [
  'https://identity.foundation/protocols/profile',
  'https://identity.foundation/protocols/connect',
  'https://identity.foundation/protocols/service-config',
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
    mocks.installProtocols.mockImplementation(() => Effect.void);
  });

  it('registers a newly discovered identity for scoped sync without driving a manual pull', async () => {
    const identity = { did: { uri: 'did:dht:new' }, metadata: { name: 'New' } };
    const agent = createAgent();

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:new',
      options: { protocols: desiredProtocols },
    });
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installProtocols).toHaveBeenCalledWith('did:dht:new');
    expect(result.changedDids).toEqual(['did:dht:new']);
  });

  it('reports no change when the SDK finds an equivalent sync scope', async () => {
    const identity = { did: { uri: 'did:dht:known' }, metadata: { name: 'Known' } };
    const agent = createAgent(false);

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(agent.sync.ensureIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:known',
      options: { protocols: desiredProtocols },
    });
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installProtocols).toHaveBeenCalledWith('did:dht:known');
    expect(result.changedDids).toEqual([]);
  });

  it('leaves delegated sync registration to the SDK grant lifecycle', async () => {
    const identity = {
      did: { uri: 'did:dht:delegate' },
      metadata: { connectedDid: 'did:dht:owner' },
    };
    const agent = createAgent();

    await reconcileIdentitySync(agent, [identity]);

    expect(mocks.installProtocols).not.toHaveBeenCalled();
    expect(agent.sync.ensureIdentityOptions).not.toHaveBeenCalled();
  });

  it('reconciles an owner once when a delegated identity references the same DID', async () => {
    const agent = createAgent();

    const result = await reconcileIdentitySync(agent, [
      { did: { uri: 'did:dht:owner' } },
      {
        did: { uri: 'did:dht:delegate' },
        metadata: { connectedDid: 'did:dht:owner' },
      },
    ]);

    expect(mocks.installProtocols).toHaveBeenCalledOnce();
    expect(mocks.installProtocols).toHaveBeenCalledWith('did:dht:owner');
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
      options: { protocols: desiredProtocols },
    });
    warn.mockRestore();
  });
});
