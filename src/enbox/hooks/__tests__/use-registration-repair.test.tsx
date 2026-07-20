import type { SyncEvent } from '@enbox/agent';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';

import { useRegistrationRepair } from '../use-registration-repair';

const mocks = vi.hoisted(() => ({
  isRepairableRegistrationFailure: vi.fn(),
  repairRegistrationFromSyncEvent: vi.fn(),
}));

vi.mock('../../registration-repair', () => ({
  isRepairableRegistrationFailure: mocks.isRepairableRegistrationFailure,
  repairRegistrationFromSyncEvent: mocks.repairRegistrationFromSyncEvent,
}));

describe('useRegistrationRepair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRepairableRegistrationFailure.mockReturnValue(true);
    mocks.repairRegistrationFromSyncEvent.mockResolvedValue(true);
  });

  afterEach(() => {
    useAuthStore.setState({ agent: null });
  });

  it('subscribes while unlocked, forwards only repairable failures, and cleans up', () => {
    let listener: ((event: SyncEvent) => void) | undefined;
    const unsubscribe = vi.fn();
    const agent = {
      sync: {
        on: vi.fn((nextListener: (event: SyncEvent) => void) => {
          listener = nextListener;
          return unsubscribe;
        }),
      },
    };
    useAuthStore.setState({ agent });
    const { unmount } = renderHook(() => useRegistrationRepair());
    const unrelatedEvent = {
      type           : 'repair:completed',
      tenantDid      : 'did:dht:alice',
      remoteEndpoint : 'https://dwn.example',
    } as SyncEvent;
    const failedEvent = {
      type           : 'repair:failed',
      tenantDid      : 'did:dht:alice',
      remoteEndpoint : 'https://dwn.example',
      attempt        : 1,
      error          : 'MessagesQuery failed: 401 Not a registered tenant.',
    } as SyncEvent;

    act(() => {
      listener?.(unrelatedEvent);
      listener?.(failedEvent);
    });

    expect(mocks.isRepairableRegistrationFailure).toHaveBeenCalledWith(failedEvent.error);
    expect(mocks.repairRegistrationFromSyncEvent).toHaveBeenCalledWith(agent, failedEvent);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not forward a repair failure that is not a registration rejection', () => {
    let listener: ((event: SyncEvent) => void) | undefined;
    const agent = {
      sync: {
        on: vi.fn((nextListener: (event: SyncEvent) => void) => {
          listener = nextListener;
          return vi.fn();
        }),
      },
    };
    mocks.isRepairableRegistrationFailure.mockReturnValue(false);
    useAuthStore.setState({ agent });

    renderHook(() => useRegistrationRepair());
    act(() => {
      listener?.({
        type           : 'repair:failed',
        tenantDid      : 'did:dht:alice',
        remoteEndpoint : 'https://dwn.example',
        attempt        : 1,
        error          : 'MessagesQuery failed: 401 Tenant is suspended.',
      });
    });

    expect(mocks.isRepairableRegistrationFailure).toHaveBeenCalledOnce();
    expect(mocks.repairRegistrationFromSyncEvent).not.toHaveBeenCalled();
  });
});
