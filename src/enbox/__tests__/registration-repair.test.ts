import type { SyncEvent } from '@enbox/agent';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isRepairableRegistrationFailure,
  repairRegistrationFromSyncEvent,
} from '../registration-repair';

const mocks = vi.hoisted(() => ({
  ensureRegistrationForDids: vi.fn(),
}));

vi.mock('../registration', () => ({
  ensureRegistrationForDids: mocks.ensureRegistrationForDids,
}));

function repairFailedEvent(
  error: string,
  overrides: Partial<SyncEvent> = {},
): SyncEvent {
  return {
    type           : 'repair:failed',
    tenantDid      : 'did:dht:alice',
    remoteEndpoint : 'https://DWN.example/',
    attempt        : 1,
    error,
    ...overrides,
  } as SyncEvent;
}

function createAgent() {
  const calls: string[] = [];
  return {
    calls,
    sync: {
      getIdentityOptions: vi.fn(async () => {
        calls.push('sync:get-options');
        return { protocols: ['https://example.com/protocol'] };
      }),
      updateIdentityOptions: vi.fn(async () => {
        calls.push('sync:update');
      }),
    },
  };
}

describe('registration repair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureRegistrationForDids.mockResolvedValue(undefined);
  });

  it.each([
    'SyncDurableFeedReconciler: MessagesQuery failed: 401 Not a registered tenant.',
    'SyncEngineLevel: MessagesSubscribe failed: 401 Agreed terms-of-service is outdated.',
  ])('recognizes a definitive registration rejection: %s', (error) => {
    expect(isRepairableRegistrationFailure(error)).toBe(true);
  });

  it.each([
    'SyncEngineLevel: MessagesSubscribe failed: 401 Tenant is suspended.',
    'SyncEngineLevel: MessagesSubscribe failed: 401 Unauthorized.',
    'Not a registered tenant.',
    '401 Not a registered tenant. Retrying after a transport failure.',
    'WebSocket connection closed unexpectedly',
  ])('rejects a non-repairable sync failure: %s', (error) => {
    expect(isRepairableRegistrationFailure(error)).toBe(false);
  });

  it('registers the rejected DID at only that endpoint and rebuilds its existing sync scope', async () => {
    const agent = createAgent();
    mocks.ensureRegistrationForDids.mockImplementation(async () => {
      agent.calls.push('tenant:register');
    });

    await expect(repairRegistrationFromSyncEvent(
      agent,
      repairFailedEvent('MessagesQuery failed: 401 Not a registered tenant.'),
    )).resolves.toBe(true);

    expect(mocks.ensureRegistrationForDids).toHaveBeenCalledWith(
      agent,
      ['https://dwn.example'],
      ['did:dht:alice'],
    );
    expect(agent.sync.updateIdentityOptions).toHaveBeenCalledWith({
      did     : 'did:dht:alice',
      options : { protocols: ['https://example.com/protocol'] },
    });
    expect(agent.calls).toEqual([
      'tenant:register',
      'sync:get-options',
      'sync:update',
    ]);
  });

  it('coalesces concurrent failures from the same DID and endpoint', async () => {
    const agent = createAgent();
    let releaseRegistration!: () => void;
    const registrationGate = new Promise<void>((resolve) => {
      releaseRegistration = resolve;
    });
    mocks.ensureRegistrationForDids.mockImplementation(() => registrationGate);
    const event = repairFailedEvent('MessagesQuery failed: 401 Not a registered tenant.');

    const first = repairRegistrationFromSyncEvent(agent, event);
    const second = repairRegistrationFromSyncEvent(agent, {
      ...event,
      protocol: 'https://example.com/other-protocol',
    });

    await vi.waitFor(() => {
      expect(mocks.ensureRegistrationForDids).toHaveBeenCalledOnce();
    });
    releaseRegistration();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(agent.sync.updateIdentityOptions).toHaveBeenCalledOnce();
  });

  it('serializes repairs for different endpoints of the same DID', async () => {
    const agent = createAgent();
    let releaseFirstRegistration!: () => void;
    const firstRegistrationGate = new Promise<void>((resolve) => {
      releaseFirstRegistration = resolve;
    });
    mocks.ensureRegistrationForDids
      .mockImplementationOnce(() => firstRegistrationGate)
      .mockResolvedValueOnce(undefined);

    const first = repairRegistrationFromSyncEvent(
      agent,
      repairFailedEvent('MessagesQuery failed: 401 Not a registered tenant.'),
    );
    const second = repairRegistrationFromSyncEvent(
      agent,
      repairFailedEvent(
        'MessagesQuery failed: 401 Agreed terms-of-service is outdated.',
        { remoteEndpoint: 'https://dwn-b.example' },
      ),
    );

    await vi.waitFor(() => {
      expect(mocks.ensureRegistrationForDids).toHaveBeenCalledTimes(1);
    });
    releaseFirstRegistration();

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mocks.ensureRegistrationForDids).toHaveBeenNthCalledWith(
      2,
      agent,
      ['https://dwn-b.example'],
      ['did:dht:alice'],
    );
    expect(agent.sync.updateIdentityOptions).toHaveBeenCalledTimes(2);
  });

  it('does not disturb sync when the tenant registration repair fails', async () => {
    const agent = createAgent();
    mocks.ensureRegistrationForDids.mockRejectedValue(new Error('registration rejected'));

    await expect(repairRegistrationFromSyncEvent(
      agent,
      repairFailedEvent('MessagesQuery failed: 401 Not a registered tenant.'),
    )).rejects.toThrow('registration rejected');

    expect(agent.sync.getIdentityOptions).not.toHaveBeenCalled();
    expect(agent.sync.updateIdentityOptions).not.toHaveBeenCalled();
  });

  it('ignores suspended tenants without sending a registration request', async () => {
    const agent = createAgent();

    await expect(repairRegistrationFromSyncEvent(
      agent,
      repairFailedEvent('MessagesQuery failed: 401 Tenant is suspended.'),
    )).resolves.toBe(false);

    expect(mocks.ensureRegistrationForDids).not.toHaveBeenCalled();
    expect(agent.sync.updateIdentityOptions).not.toHaveBeenCalled();
  });
});
