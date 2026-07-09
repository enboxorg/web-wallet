import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useIdentitySyncReconciliation } from '../use-identity-sync-reconciliation';

const mocks = vi.hoisted(() => ({
  reconcileIdentitySync: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../identity-sync', () => ({
  getIdentityDid: (identity: any) =>
    identity?.metadata?.connectedDid ?? identity?.did?.uri,
  reconcileIdentitySync: mocks.reconcileIdentitySync,
}));

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError },
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useIdentitySyncReconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: { id: 'agent-1' },
    });
    mocks.reconcileIdentitySync.mockResolvedValue({ changedDids: [], failedDids: [] });
  });

  it('reconciles discovered identities with the wallet sync scope', async () => {
    const queryClient = createQueryClient();
    const identities = [{ did: { uri: 'did:dht:new' }, metadata: { name: 'New' } }];

    renderHook(() => useIdentitySyncReconciliation(identities), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(mocks.reconcileIdentitySync).toHaveBeenCalledWith(
        { id: 'agent-1' },
        identities,
      );
    });
  });

  it('invalidates identity and profile queries after registering a discovered identity', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const identities = [{ did: { uri: 'did:dht:new' }, metadata: { name: 'New' } }];
    mocks.reconcileIdentitySync.mockResolvedValue({ changedDids: ['did:dht:new'], failedDids: [] });

    renderHook(() => useIdentitySyncReconciliation(identities), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
    }));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:new'),
    });
  });

  it('surfaces a reconciliation failure instead of swallowing it', async () => {
    const queryClient = createQueryClient();
    const identities = [{ did: { uri: 'did:dht:new' }, metadata: { name: 'New' } }];
    mocks.reconcileIdentitySync.mockRejectedValue(new Error('boom'));

    renderHook(() => useIdentitySyncReconciliation(identities), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  });

  it('retries a transient per-identity reconciliation failure once', async () => {
    const queryClient = createQueryClient();
    const identities = [{ did: { uri: 'did:dht:failed' }, metadata: { name: 'Failed' } }];
    mocks.reconcileIdentitySync
      .mockResolvedValueOnce({ changedDids: [], failedDids: ['did:dht:failed'] })
      .mockResolvedValueOnce({ changedDids: ['did:dht:failed'], failedDids: [] });

    renderHook(() => useIdentitySyncReconciliation(identities), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('surfaces a persistent per-identity reconciliation failure after retry', async () => {
    const queryClient = createQueryClient();
    const identities = [{ did: { uri: 'did:dht:failed' }, metadata: { name: 'Failed' } }];
    mocks.reconcileIdentitySync.mockResolvedValue({
      changedDids: [],
      failedDids: ['did:dht:failed'],
    });

    renderHook(() => useIdentitySyncReconciliation(identities), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2);
  });
});
