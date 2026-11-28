import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useIdentitySyncReconciliation } from '../use-identity-sync-reconciliation';

const mocks = vi.hoisted(() => ({
  reconcileIdentitySync: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../identity-sync', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../identity-sync')>(),
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

  it('reconciles when an owner replaces a delegated view of the same DID', async () => {
    const queryClient = createQueryClient();
    const delegatedIdentity = {
      did: { uri: 'did:dht:delegate' },
      metadata: { connectedDid: 'did:dht:owner' },
    };
    const ownerIdentity = { did: { uri: 'did:dht:owner' } };
    const { rerender } = renderHook(
      ({ identities }) => useIdentitySyncReconciliation(identities),
      {
        initialProps: { identities: [delegatedIdentity] },
        wrapper: createWrapper(queryClient),
      },
    );

    expect(mocks.reconcileIdentitySync).not.toHaveBeenCalled();
    rerender({ identities: [ownerIdentity] });

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledOnce());
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith(
      { id: 'agent-1' },
      [ownerIdentity],
    );
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

  it('does not retry a persistent failure on an equivalent identity refetch', async () => {
    const queryClient = createQueryClient();
    mocks.reconcileIdentitySync.mockResolvedValue({
      changedDids: [],
      failedDids: ['did:dht:failed'],
    });
    const { rerender } = renderHook(
      ({ identities }) => useIdentitySyncReconciliation(identities),
      {
        initialProps: {
          identities: [{ did: { uri: 'did:dht:failed' }, metadata: { name: 'Failed' } }],
        },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    rerender({
      identities: [{ did: { uri: 'did:dht:failed' }, metadata: { name: 'Refetched' } }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('only reconciles newly added identities instead of re-reconciling already prepared ones', async () => {
    const queryClient = createQueryClient();
    const alice = { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } };
    const bob = { did: { uri: 'did:dht:bob' }, metadata: { name: 'Bob' } };
    const { rerender } = renderHook(
      ({ identities }) => useIdentitySyncReconciliation(identities),
      {
        initialProps: { identities: [alice] },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1));
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith({ id: 'agent-1' }, [alice]);

    rerender({ identities: [alice, bob] });

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2));
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith({ id: 'agent-1' }, [bob]);
  });

  it('stops retrying and suppresses toasts when unmounted or locked mid-reconciliation', async () => {
    const queryClient = createQueryClient();
    const alice = { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } };
    let resolveReconcile!: (result: { changedDids: string[]; failedDids: string[] }) => void;
    mocks.reconcileIdentitySync.mockReturnValueOnce(new Promise((resolve) => {
      resolveReconcile = resolve;
    }));

    const { unmount } = renderHook(() => useIdentitySyncReconciliation([alice]), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1));
    unmount();
    useAuthStore.setState({ agent: null });

    resolveReconcile({ changedDids: [], failedDids: ['did:dht:alice'] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('re-reconciles an identity if it is removed and re-imported in the same session', async () => {
    const queryClient = createQueryClient();
    const alice = { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } };
    const bob = { did: { uri: 'did:dht:bob' }, metadata: { name: 'Bob' } };
    const { rerender } = renderHook(
      ({ identities }) => useIdentitySyncReconciliation(identities),
      {
        initialProps: { identities: [alice, bob] },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1));

    // Delete alice, keeping bob.
    rerender({ identities: [bob] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Re-import alice — it must be reconciled again.
    rerender({ identities: [alice, bob] });
    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2));
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith({ id: 'agent-1' }, [alice]);
  });

  it('re-reconciles when the last remaining identity is deleted and re-imported', async () => {
    const queryClient = createQueryClient();
    const alice = { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } };
    const { rerender } = renderHook(
      ({ identities }) => useIdentitySyncReconciliation(identities),
      {
        initialProps: { identities: [alice] },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1));

    // Delete the sole identity -> empty list must still prune reconciled state.
    rerender({ identities: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    rerender({ identities: [alice] });
    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2));
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith({ id: 'agent-1' }, [alice]);
  });

  it('runs queued reconciliation for a replacement agent when the agent changes mid-flight', async () => {
    const queryClient = createQueryClient();
    const alice = { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } };
    const agent2 = { id: 'agent-2' };
    let resolveAgent1!: (result: { changedDids: string[]; failedDids: string[] }) => void;
    mocks.reconcileIdentitySync
      .mockReturnValueOnce(new Promise((resolve) => { resolveAgent1 = resolve; }))
      .mockResolvedValueOnce({ changedDids: [], failedDids: [] });

    renderHook(() => useIdentitySyncReconciliation([alice]), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1));

    // Swap to agent-2 while agent-1's reconciliation is still in flight.
    act(() => {
      useAuthStore.setState({ agent: agent2 as never });
    });
    resolveAgent1({ changedDids: [], failedDids: [] });

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2));
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith(agent2, [alice]);
  });

  it('does not re-mark the sole identity as reconciled if it was deleted while reconciliation was in flight', async () => {
    const queryClient = createQueryClient();
    const alice = { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } };
    let resolveFirst!: (result: { changedDids: string[]; failedDids: string[] }) => void;
    mocks.reconcileIdentitySync
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ changedDids: [], failedDids: [] });

    const { rerender } = renderHook(
      ({ identities }) => useIdentitySyncReconciliation(identities),
      {
        initialProps: { identities: [alice] },
        wrapper: createWrapper(queryClient),
      },
    );

    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(1));

    // Delete the sole identity while its reconciliation is still running.
    rerender({ identities: [] });
    await act(async () => {
      resolveFirst({ changedDids: [], failedDids: [] });
      await Promise.resolve();
    });

    // Re-importing the same DID in the same session must reconcile again.
    rerender({ identities: [alice] });
    await waitFor(() => expect(mocks.reconcileIdentitySync).toHaveBeenCalledTimes(2));
    expect(mocks.reconcileIdentitySync).toHaveBeenLastCalledWith({ id: 'agent-1' }, [alice]);
  });
});
