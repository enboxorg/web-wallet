import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reconcileIdentitySync } from '../identity-sync';

const mocks = vi.hoisted(() => ({
  ensureRegistration: vi.fn(),
}));

vi.mock('../registration', () => ({
  ensureRegistration: mocks.ensureRegistration,
}));

vi.mock('../protocols', () => ({
  IDENTITY_SYNC_PROTOCOLS: [
    'https://identity.foundation/protocols/social-graph',
    'https://identity.foundation/protocols/profile',
    'https://identity.foundation/protocols/connect',
  ],
}));

const desiredProtocols = [
  'https://identity.foundation/protocols/social-graph',
  'https://identity.foundation/protocols/profile',
  'https://identity.foundation/protocols/connect',
];

function createAgent(existingOptions: Record<string, unknown> = {}) {
  return {
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
    mocks.ensureRegistration.mockResolvedValue(undefined);
  });

  it('registers a newly discovered identity and pulls its existing records', async () => {
    const identity = { did: { uri: 'did:dht:new' }, metadata: { name: 'New' } };
    const agent = createAgent();

    const result = await reconcileIdentitySync(agent, [identity], ['https://dwn.example']);

    expect(mocks.ensureRegistration).toHaveBeenCalledWith(agent, ['https://dwn.example']);
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did: 'did:dht:new',
      options: { protocols: desiredProtocols },
    });
    expect(agent.sync.sync).toHaveBeenCalledWith('pull');
    expect(result.changedDids).toEqual(['did:dht:new']);
  });

  it('updates broad all-protocol registrations to the wallet-scoped protocol set', async () => {
    const identity = { did: { uri: 'did:dht:existing' }, metadata: { name: 'Existing' } };
    const agent = createAgent({
      'did:dht:existing': { protocols: 'all' },
    });

    const result = await reconcileIdentitySync(agent, [identity], ['https://dwn.example']);

    expect(agent.sync.registerIdentity).not.toHaveBeenCalled();
    expect(agent.sync.updateIdentityOptions).toHaveBeenCalledWith({
      did: 'did:dht:existing',
      options: { protocols: desiredProtocols },
    });
    expect(agent.sync.sync).toHaveBeenCalledWith('pull');
    expect(result.changedDids).toEqual(['did:dht:existing']);
  });

  it('does not pull when all identities already have the wallet sync scope', async () => {
    const identity = { did: { uri: 'did:dht:known' }, metadata: { name: 'Known' } };
    const agent = createAgent({
      'did:dht:known': { protocols: desiredProtocols },
    });

    const result = await reconcileIdentitySync(agent, [identity], ['https://dwn.example']);

    expect(mocks.ensureRegistration).not.toHaveBeenCalled();
    expect(agent.sync.registerIdentity).not.toHaveBeenCalled();
    expect(agent.sync.updateIdentityOptions).not.toHaveBeenCalled();
    expect(agent.sync.sync).not.toHaveBeenCalled();
    expect(result.changedDids).toEqual([]);
  });

  it('uses connectedDid metadata when an identity is represented by a delegate DID', async () => {
    const identity = {
      did: { uri: 'did:dht:delegate' },
      metadata: { connectedDid: 'did:dht:owner' },
    };
    const agent = createAgent();

    await reconcileIdentitySync(agent, [identity], ['https://dwn.example']);

    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did: 'did:dht:owner',
      options: { protocols: desiredProtocols },
    });
  });
});
