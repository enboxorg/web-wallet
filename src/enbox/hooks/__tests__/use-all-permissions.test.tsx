import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';

import { useAllPermissions } from '../use-all-permissions';

const mocks = vi.hoisted(() => ({
  fetchPermissionHistory: vi.fn(),
  fetchPermissions: vi.fn(),
}));

vi.mock('../../queries/identity-queries', () => ({
  fetchPermissionHistory: mocks.fetchPermissionHistory,
  fetchPermissions: mocks.fetchPermissions,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useAllPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      initialized : true,
      firstTime   : false,
      agent       : { id: 'agent-1' } as never,
    });
  });

  it('keeps permission results associated with their owner identity', async () => {
    mocks.fetchPermissions.mockImplementation(async (_agent, ownerDid: string) => [{
      id: `grant-${ownerDid}`,
    }]);
    mocks.fetchPermissionHistory.mockImplementation(async (_agent, ownerDid: string) => [{
      id: `grant-${ownerDid}`,
    }, {
      id: `revoked-${ownerDid}`,
    }]);

    const { result } = renderHook(
      () => useAllPermissions(['did:dht:alice', 'did:dht:bob'], true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual([
      {
        ownerDid    : 'did:dht:alice',
        permissions : [
          { id: 'grant-did:dht:alice' },
          { id: 'revoked-did:dht:alice' },
        ],
        revokedGrantIds: ['revoked-did:dht:alice'],
      },
      {
        ownerDid    : 'did:dht:bob',
        permissions : [
          { id: 'grant-did:dht:bob' },
          { id: 'revoked-did:dht:bob' },
        ],
        revokedGrantIds: ['revoked-did:dht:bob'],
      },
    ]);
  });

  it('surfaces query failure so refresh approval can fail closed', async () => {
    mocks.fetchPermissions.mockRejectedValue(new Error('permission query failed'));
    mocks.fetchPermissionHistory.mockResolvedValue([]);

    const { result } = renderHook(
      () => useAllPermissions(['did:dht:alice'], true),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPending).toBe(false);
  });

  it('does not query permissions when refresh detection is disabled', () => {
    renderHook(
      () => useAllPermissions(['did:dht:alice'], false),
      { wrapper: createWrapper() },
    );

    expect(mocks.fetchPermissions).not.toHaveBeenCalled();
    expect(mocks.fetchPermissionHistory).not.toHaveBeenCalled();
  });
});
