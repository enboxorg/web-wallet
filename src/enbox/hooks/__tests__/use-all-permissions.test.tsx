import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';

import { useAllPermissions } from '../use-all-permissions';

const mocks = vi.hoisted(() => ({
  fetchPermissions: vi.fn(),
}));

vi.mock('../../queries/identity-queries', () => ({
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
      unlocked    : true,
      firstTime   : false,
      agent       : { id: 'agent-1' } as never,
    });
  });

  it('keeps permission results associated with their owner identity', async () => {
    mocks.fetchPermissions.mockImplementation(async (_agent, ownerDid: string) => [{
      id: `grant-${ownerDid}`,
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
        permissions : [{ id: 'grant-did:dht:alice' }],
      },
      {
        ownerDid    : 'did:dht:bob',
        permissions : [{ id: 'grant-did:dht:bob' }],
      },
    ]);
  });

  it('surfaces query failure so refresh approval can fail closed', async () => {
    mocks.fetchPermissions.mockRejectedValue(new Error('permission query failed'));

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
  });
});
