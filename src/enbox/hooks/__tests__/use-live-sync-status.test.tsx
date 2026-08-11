import type { ReactNode } from 'react';
import type { SyncEvent, SyncIdentityStatus } from '@enbox/agent';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useLiveSyncStatus, useRetryRemoteSync } from '../use-live-sync-status';

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  useAuthStore.setState({ agent: null });
});

describe('useLiveSyncStatus', () => {
  it('coalesces matching sync events into one identity-status refresh', async () => {
    let listener: ((event: SyncEvent) => void) | undefined;
    const unsubscribe = vi.fn();
    const getIdentitySyncStatus = vi.fn(async (): Promise<SyncIdentityStatus> => ({
      registration : undefined,
      health       : {
        connectivity            : 'online',
        failedMessageCount      : 0,
        degradedLinkCount       : 0,
        quotaBlockedMessageCount: 0,
        syncHealthy             : true,
      },
      connectivity : 'online',
      currentness  : 'caught-up',
      remotes      : [{
        tenantDid               : 'did:dht:alice',
        remoteEndpoint          : 'https://dwn.example',
        state                   : 'healthy',
        connectivity            : 'online',
        quotaBlockedMessageCount: 0,
        failedMessageCount      : 0,
      }],
      links: [{
        tenantDid      : 'did:dht:alice',
        remoteEndpoint : 'https://dwn.example',
        scope          : { kind: 'full' },
        status         : 'live',
        connectivity   : 'online',
        isPullCurrent  : true,
      }],
    }));
    useAuthStore.setState({
      agent: {
        sync: {
          getIdentitySyncStatus,
          on: vi.fn((nextListener: (event: SyncEvent) => void) => {
            listener = nextListener;
            return unsubscribe;
          }),
        },
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result, unmount } = renderHook(
      () => useLiveSyncStatus('did:dht:alice'),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => {
      expect(result.current.data?.remotes).toHaveLength(1);
      expect(result.current.data?.links).toHaveLength(1);
    });

    act(() => {
      listener?.({
        type           : 'link:status-change',
        tenantDid      : 'did:dht:other',
        remoteEndpoint : 'https://dwn.example',
        from           : 'initializing',
        to             : 'live',
      });
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => {
      const event: SyncEvent = {
        type           : 'link:status-change',
        tenantDid      : 'did:dht:alice',
        remoteEndpoint : 'https://dwn.example',
        from           : 'initializing',
        to             : 'live',
      };
      listener?.(event);
      listener?.(event);
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledOnce(), { timeout: 1_500 });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.syncStatus('did:dht:alice'),
    });
    await waitFor(() => expect(getIdentitySyncStatus).toHaveBeenCalledTimes(2));

    act(() => {
      listener?.({
        type           : 'link:status-change',
        tenantDid      : 'did:dht:alice',
        remoteEndpoint : 'https://dwn.example',
        from           : 'live',
        to             : 'repairing',
      });
    });
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledOnce();
  });

  it('refreshes identity sync status after a targeted retry', async () => {
    const retryRemoteNow = vi.fn(async () => undefined);
    useAuthStore.setState({ agent: { sync: { retryRemoteNow } } });
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result, unmount } = renderHook(
      () => useRetryRemoteSync('did:dht:alice'),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.mutateAsync('https://dwn.example');
    });

    expect(retryRemoteNow).toHaveBeenCalledWith('did:dht:alice', 'https://dwn.example');
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.syncStatus('did:dht:alice'),
    });
    expect(invalidateSpy).toHaveBeenCalledOnce();
    unmount();
  });
});
