import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useSyncQueryInvalidation } from '../use-sync-query-invalidation';
import { runEnboxPromise } from '../../effect/runtime';
import { publishWalletEvent } from '../../effect/wallet-events';

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

describe('useSyncQueryInvalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invalidates identities when agent-DID sync pulls new metadata', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    let listener: ((event: any) => void) | undefined;
    const unsubscribe = vi.fn();

    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: {
        agentDid: { uri: 'did:dht:agent' },
        sync: {
          on: vi.fn((nextListener) => {
            listener = nextListener;
            return unsubscribe;
          }),
        },
      },
    });

    const { unmount } = renderHook(() => useSyncQueryInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      listener?.({
        type: 'checkpoint:pull-advance',
        tenantDid: 'did:dht:agent',
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
    });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('invalidates a profile when profile records are pulled for an identity DID', () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    let listener: ((event: any) => void) | undefined;

    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: {
        agentDid: { uri: 'did:dht:agent' },
        sync: {
          on: vi.fn((nextListener) => {
            listener = nextListener;
            return vi.fn();
          }),
        },
      },
    });

    renderHook(() => useSyncQueryInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      listener?.({
        type: 'checkpoint:pull-advance',
        tenantDid: 'did:dht:identity',
        protocol: 'https://identity.foundation/protocols/profile',
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:identity'),
    });
  });

  it('invalidates queries when reconcile admits remote messages', () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    let listener: ((event: any) => void) | undefined;

    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: {
        agentDid: { uri: 'did:dht:agent' },
        sync: {
          on: vi.fn((nextListener) => {
            listener = nextListener;
            return vi.fn();
          }),
        },
      },
    });

    renderHook(() => useSyncQueryInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      listener?.({
        type: 'reconcile:applied',
        tenantDid: 'did:dht:identity',
        protocol: 'https://identity.foundation/protocols/profile',
        messageCids: ['bafy123'],
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:identity'),
    });
  });

  it('invalidates a profile when scoped sync events include profile in protocols', () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    let listener: ((event: any) => void) | undefined;

    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: {
        agentDid: { uri: 'did:dht:agent' },
        sync: {
          on: vi.fn((nextListener) => {
            listener = nextListener;
            return vi.fn();
          }),
        },
      },
    });

    renderHook(() => useSyncQueryInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      listener?.({
        type: 'reconcile:applied',
        tenantDid: 'did:dht:identity',
        protocols: [
          'https://identity.foundation/protocols/social-graph',
          'https://identity.foundation/protocols/profile',
          'https://identity.foundation/protocols/connect',
        ],
        messageCids: ['bafy123'],
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:identity'),
    });
  });

  it('invalidates profile queries from wallet domain events', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: null,
    });

    renderHook(() => useSyncQueryInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await runEnboxPromise(publishWalletEvent({
        _tag     : 'identity.profile.updated',
        did      : 'did:dht:identity',
        avatar   : true,
        hero     : false,
        metadata : true,
        timestamp: Date.now(),
      }));
    });

    await vi.waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.identities.profile('did:dht:identity'),
      });
    });
  });
});
