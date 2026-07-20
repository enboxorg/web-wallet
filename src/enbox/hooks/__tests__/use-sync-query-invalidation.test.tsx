import type { ReactNode } from 'react';
import type { SyncEvent } from '@enbox/agent';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { ConnectDefinition, ProfileDefinition, SocialGraphDefinition } from '@enbox/protocols';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useSyncQueryInvalidation } from '../use-sync-query-invalidation';
import { runEnboxPromise } from '../../effect/runtime';
import { publishWalletEvent } from '../../effect/wallet-events';

type TestSubscription = {
  connectedDid: string;
  delegateDid?: string;
  request: { filters?: Array<{ protocol?: string }> };
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, detail: unknown) => void;
};

const sdkMocks = vi.hoisted(() => ({
  subscriptions : [] as TestSubscription[],
  syncListeners : new Set<(event: SyncEvent) => void>(),
}));

vi.mock('@enbox/api', () => ({
  Enbox: function Enbox(options: { connectedDid: string; delegateDid?: string }) {
    return {
      dwn: {
        messages: {
          subscribe: vi.fn(async (request: TestSubscription['request'] = {}) => {
            const handlers = new Map<string, Set<(detail: unknown) => void>>();
            const close = vi.fn(async () => {});
            const liveQuery = {
              close,
              on: vi.fn((event: string, handler: (detail: unknown) => void) => {
                const eventHandlers = handlers.get(event) ?? new Set();
                eventHandlers.add(handler);
                handlers.set(event, eventHandlers);
                return () => eventHandlers.delete(handler);
              }),
            };

            sdkMocks.subscriptions.push({
              connectedDid: options.connectedDid,
              delegateDid : options.delegateDid,
              request,
              close,
              emit: (event, detail) => {
                for (const handler of handlers.get(event) ?? []) {
                  handler(detail);
                }
              },
            });

            return {
              status: { code: 200, detail: 'OK' },
              liveQuery,
            };
          }),
        },
      },
    };
  },
}));

function createQueryClient(): QueryClient {
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

function setAgent(optionsByDid: Record<string, { delegateDid?: string }> = {}): void {
  useAuthStore.setState({
    initialized: true,
    unlocked   : true,
    firstTime  : false,
    agent      : {
      agentDid: { uri: 'did:dht:agent' },
      sync    : {
        getIdentityOptions: vi.fn(async (did: string) => optionsByDid[did]),
        on: vi.fn((listener: (event: SyncEvent) => void) => {
          sdkMocks.syncListeners.add(listener);
          return () => sdkMocks.syncListeners.delete(listener);
        }),
      },
    },
  });
}

async function settleSubscriptions(): Promise<void> {
  await act(async () => {
    for (let index = 0; index < 6; index += 1) {
      await Promise.resolve();
    }
  });
}

function emitMessage(
  subscription: TestSubscription,
  descriptor: { interface: string; method: string; protocol?: string },
): void {
  subscription.emit('event', { descriptor });
}

function emitSyncEvent(event: SyncEvent): void {
  for (const listener of sdkMocks.syncListeners) {
    listener(event);
  }
}

describe('useSyncQueryInvalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.subscriptions.length = 0;
    sdkMocks.syncListeners.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    useAuthStore.setState({ agent: null });
  });

  it('invalidates identities when the agent DID receives metadata', async () => {
    setAgent();
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { unmount } = renderHook(() => useSyncQueryInvalidation([]), {
      wrapper: createWrapper(queryClient),
    });

    await settleSubscriptions();
    const subscription = sdkMocks.subscriptions.find(
      ({ connectedDid }) => connectedDid === 'did:dht:agent',
    );
    expect(subscription?.request).toEqual({});

    act(() => {
      emitMessage(subscription!, { interface: 'Records', method: 'Write' });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
      exact: true,
    });

    unmount();
    expect(subscription?.close).toHaveBeenCalledOnce();
    expect(sdkMocks.syncListeners.size).toBe(0);
  });

  it('uses single-protocol subscriptions for a delegated identity', async () => {
    setAgent({ 'did:dht:identity': { delegateDid: 'did:dht:delegate' } });
    const queryClient = createQueryClient();
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    const identitySubscriptions = sdkMocks.subscriptions.filter(
      ({ connectedDid }) => connectedDid === 'did:dht:identity',
    );

    expect(identitySubscriptions).toHaveLength(3);
    expect(identitySubscriptions.map(({ request }) => request.filters?.[0]?.protocol)).toEqual(
      expect.arrayContaining([
        SocialGraphDefinition.protocol,
        ProfileDefinition.protocol,
        ConnectDefinition.protocol,
      ]),
    );
    expect(identitySubscriptions.every(({ delegateDid }) => delegateDid === 'did:dht:delegate')).toBe(true);
  });

  it('does not recreate subscriptions when a refetch returns the same identities', async () => {
    setAgent();
    const queryClient = createQueryClient();
    const { rerender } = renderHook(
      ({ identities }) => useSyncQueryInvalidation(identities),
      {
        wrapper: createWrapper(queryClient),
        initialProps: { identities: [{ did: { uri: 'did:dht:identity' } }] },
      },
    );

    await settleSubscriptions();
    const initialSubscriptions = [...sdkMocks.subscriptions];
    rerender({ identities: [{ did: { uri: 'did:dht:identity' } }] });
    await settleSubscriptions();

    expect(sdkMocks.subscriptions).toEqual(initialSubscriptions);
    expect(initialSubscriptions.every(({ close }) => !close.mock.calls.length)).toBe(true);
  });

  it('routes profile messages to profile, identity, and activity queries', async () => {
    setAgent({ 'did:dht:identity': { delegateDid: 'did:dht:delegate' } });
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    const subscription = sdkMocks.subscriptions.find(
      ({ request }) => request.filters?.[0]?.protocol === ProfileDefinition.protocol,
    );

    act(() => {
      emitMessage(subscription!, {
        interface: 'Records',
        method   : 'Write',
        protocol : ProfileDefinition.protocol,
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.activity('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
      exact: true,
    });
  });

  it('routes social and connect messages to their dependent queries', async () => {
    setAgent({ 'did:dht:identity': { delegateDid: 'did:dht:delegate' } });
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    const socialSubscription = sdkMocks.subscriptions.find(
      ({ request }) => request.filters?.[0]?.protocol === SocialGraphDefinition.protocol,
    );
    const connectSubscription = sdkMocks.subscriptions.find(
      ({ request }) => request.filters?.[0]?.protocol === ConnectDefinition.protocol,
    );

    act(() => {
      emitMessage(socialSubscription!, {
        interface: 'Records',
        method   : 'Delete',
        protocol : SocialGraphDefinition.protocol,
      });
      emitMessage(connectSubscription!, {
        interface: 'Records',
        method   : 'Write',
        protocol : ConnectDefinition.protocol,
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.socialGraph('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.wallets('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.permissions('did:dht:identity'),
    });
  });

  it('routes protocol and permission messages for an owner identity', async () => {
    setAgent();
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(
      () => useSyncQueryInvalidation([{ metadata: { connectedDid: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    const subscription = sdkMocks.subscriptions.find(
      ({ connectedDid }) => connectedDid === 'did:dht:identity',
    );
    expect(subscription?.request).toEqual({});

    act(() => {
      emitMessage(subscription!, { interface: 'Protocols', method: 'Configure' });
      emitMessage(subscription!, { interface: 'Permissions', method: 'Grant' });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.protocols('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.permissions('did:dht:identity'),
    });
  });

  it('coalesces a live delivery with the matching local subscription event', async () => {
    setAgent();
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );
    await settleSubscriptions();
    const subscription = sdkMocks.subscriptions.find(
      ({ connectedDid }) => connectedDid === 'did:dht:identity',
    );

    act(() => {
      emitSyncEvent({
        type           : 'delivery:applied',
        tenantDid      : 'did:dht:identity',
        remoteEndpoint : 'https://dwn.example',
        messageCid     : 'cid-1',
        descriptor     : {
          interface : 'Records',
          method    : 'Write',
          protocol  : ProfileDefinition.protocol,
        },
      });
      emitMessage(subscription!, {
        interface : 'Records',
        method    : 'Write',
        protocol  : ProfileDefinition.protocol,
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.activity('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.audienceDeliveries('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(4);
  });

  it('falls back to broad identity invalidation for CID-only reconciliation events', () => {
    setAgent();
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      emitSyncEvent({
        type           : 'reconcile:applied',
        tenantDid      : 'did:dht:other',
        remoteEndpoint : 'https://dwn.example',
        messageCids    : ['cid-other'],
      });
      vi.advanceTimersByTime(250);
    });
    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => {
      emitSyncEvent({
        type           : 'reconcile:applied',
        tenantDid      : 'did:dht:identity',
        remoteEndpoint : 'https://dwn.example',
        messageCids    : ['cid-1'],
      });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.protocols('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.socialGraph('did:dht:identity'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.permissions('did:dht:identity'),
    });
  });

  it('invalidates profile queries from wallet domain events', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    useAuthStore.setState({ agent: null });

    renderHook(() => useSyncQueryInvalidation(undefined), {
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
