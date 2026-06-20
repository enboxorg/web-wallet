import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useIdentitySyncReconciliation } from '../use-identity-sync-reconciliation';

const mocks = vi.hoisted(() => ({
  reconcileIdentitySync: vi.fn(),
}));

vi.mock('../../identity-sync', () => ({
  getIdentityDid: (identity: any) =>
    identity?.metadata?.connectedDid ?? identity?.did?.uri,
  reconcileIdentitySync: mocks.reconcileIdentitySync,
}));

vi.mock('@/lib/dwn-endpoints', () => ({
  DEFAULT_DWN_ENDPOINTS: ['https://fly.example/dwn', 'https://aws.example/dwn'],
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
    mocks.reconcileIdentitySync.mockResolvedValue({ changedDids: [] });
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
        ['https://fly.example/dwn', 'https://aws.example/dwn'],
      );
    });
  });

  it('invalidates identity and profile queries after registering a discovered identity', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const identities = [{ did: { uri: 'did:dht:new' }, metadata: { name: 'New' } }];
    mocks.reconcileIdentitySync.mockResolvedValue({ changedDids: ['did:dht:new'] });

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
});
