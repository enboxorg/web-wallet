import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import { reconcileIdentitySync } from '../identity-sync';

const mocks = vi.hoisted(() => ({
  ensureRegistration: vi.fn(),
  installProtocols: vi.fn(),
}));

vi.mock('../registration', async () => {
  const { Effect } = await vi.importActual<typeof import('effect')>('effect');

  mocks.ensureRegistration.mockImplementation(() => Effect.void);

  return {
    ensureRegistrationEffect: mocks.ensureRegistration,
  };
});

vi.mock('../protocols', () => ({
  IDENTITY_SYNC_PROTOCOLS: [
    'https://identity.foundation/protocols/profile',
    'https://identity.foundation/protocols/connect',
  ],
  installProtocolsEffect: mocks.installProtocols,
}));

const desiredProtocols = [
  'https://identity.foundation/protocols/profile',
  'https://identity.foundation/protocols/connect',
];

function createAgent(existingOptions: Record<string, unknown> = {}) {
  return {
    dwn: {
      getRemoteDwnEndpointUrls: vi.fn(async () => ['https://dwn.example']),
    },
    sync: {
      getIdentityOptions: vi.fn(async (did: string) => existingOptions[did]),
      registerIdentity: vi.fn(),
      updateIdentityOptions: vi.fn(),
      sync: vi.fn(),
    },
  };
}

describe('reconcileIdentitySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureRegistration.mockImplementation(() => Effect.void);
    mocks.installProtocols.mockImplementation(() => Effect.void);
  });

  it('registers a newly discovered identity for scoped sync without driving a manual pull', async () => {
    const identity = { did: { uri: 'did:dht:new' }, metadata: { name: 'New' } };
    const agent = createAgent();

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(mocks.ensureRegistration).not.toHaveBeenCalled();
    expect(agent.dwn.getRemoteDwnEndpointUrls).not.toHaveBeenCalled();
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did: 'did:dht:new',
      options: { protocols: desiredProtocols },
    });
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installProtocols).toHaveBeenCalledWith('did:dht:new');
    expect(result.changedDids).toEqual(['did:dht:new']);
  });

  it('updates broad all-protocol registrations to the wallet-scoped protocol set', async () => {
    const identity = { did: { uri: 'did:dht:existing' }, metadata: { name: 'Existing' } };
    const agent = createAgent({
      'did:dht:existing': { protocols: 'all' },
    });

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(agent.sync.registerIdentity).not.toHaveBeenCalled();
    expect(agent.sync.updateIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:existing',
      options: { protocols: desiredProtocols },
    });
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installProtocols).toHaveBeenCalledWith('did:dht:existing');
    expect(result.changedDids).toEqual(['did:dht:existing']);
  });

  it('does not pull when all identities already have the wallet sync scope', async () => {
    const identity = { did: { uri: 'did:dht:known' }, metadata: { name: 'Known' } };
    const agent = createAgent({
      'did:dht:known': { protocols: desiredProtocols },
    });

    const result = await reconcileIdentitySync(agent, [identity]);

    expect(mocks.ensureRegistration).not.toHaveBeenCalled();
    expect(agent.sync.registerIdentity).not.toHaveBeenCalled();
    expect(agent.sync.updateIdentityOptions).not.toHaveBeenCalled();
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(mocks.installProtocols).toHaveBeenCalledWith('did:dht:known');
    expect(result.changedDids).toEqual([]);
  });

  it('uses connectedDid metadata when an identity is represented by a delegate DID', async () => {
    const identity = {
      did: { uri: 'did:dht:delegate' },
      metadata: { connectedDid: 'did:dht:owner' },
    };
    const agent = createAgent();

    await reconcileIdentitySync(agent, [identity]);

    expect(agent.dwn.getRemoteDwnEndpointUrls).not.toHaveBeenCalled();
    expect(mocks.ensureRegistration).not.toHaveBeenCalled();
    expect(mocks.installProtocols).not.toHaveBeenCalled();
    expect(agent.sync.getIdentityOptions).toHaveBeenCalledWith('did:dht:owner');
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did: 'did:dht:owner',
      options: {
        delegateDid: 'did:dht:delegate',
        protocols: desiredProtocols,
      },
    });
  });

  it('continues reconciling later identities when one sync registration fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const agent = createAgent();
    agent.sync.registerIdentity.mockImplementation(async ({ did }: { did: string }) => {
      if (did === 'did:dht:bad') {
        throw new Error('sync registration failed');
      }
    });

    const result = await reconcileIdentitySync(agent, [
      { did: { uri: 'did:dht:bad' }, metadata: { name: 'Bad' } },
      { did: { uri: 'did:dht:good' }, metadata: { name: 'Good' } },
    ]);

    expect(result).toEqual({
      changedDids: ['did:dht:good'],
      failedDids: ['did:dht:bad'],
    });
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did: 'did:dht:good',
      options: { protocols: desiredProtocols },
    });
    expect(agent.dwn.getRemoteDwnEndpointUrls).not.toHaveBeenCalled();
    expect(mocks.ensureRegistration).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
