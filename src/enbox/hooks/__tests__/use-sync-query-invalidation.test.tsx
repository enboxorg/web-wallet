import type { ReactNode } from 'react';
import type { SyncEvent, SyncIdentityOptions } from '@enbox/agent';
import type { DwnEndpointResolution } from '@enbox/dids';

import { normalizeSyncProtocols, ServiceConfigProtocolDefinition } from '@enbox/agent';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { ConnectDefinition, ProfileDefinition } from '@enbox/protocols';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../../queries/query-keys';
import { useSyncQueryInvalidation } from '../use-sync-query-invalidation';
import { runEnboxPromise } from '../../effect/runtime';
import { publishWalletEvent } from '../../effect/wallet-events';

type TestSubscription = {
  connectedDid: string;
  delegateDid?: string;
  request: { filters?: Array<{ protocol?: string }>; subscriptionHandler?: (message: unknown) => void };
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, detail: unknown) => void;
};

const sdkMocks = vi.hoisted(() => ({
  closeFacade  : vi.fn(),
  subscriptions : [] as TestSubscription[],
  syncListeners : new Set<(event: SyncEvent) => void>(),
}));

vi.mock('@enbox/browser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/browser')>(),
  Enbox: function Enbox(options: { connectedDid: string; delegateDid?: string }) {
    return {
      close: sdkMocks.closeFacade,
      dwn: {
        messages: {
          subscribe: vi.fn(async (request: TestSubscription['request'] = {}) => {
            const close = vi.fn(async () => {});

            sdkMocks.subscriptions.push({
              connectedDid: options.connectedDid,
              delegateDid : options.delegateDid,
              request,
              close,
              emit: (event, detail) => {
                if (event === 'event') {
                  request.subscriptionHandler?.({ type: 'event', event: { message: detail } });
                  return;
                }
                request.subscriptionHandler?.({ type: 'error', error: detail });
              },
            });

            return {
              status: { code: 200, detail: 'OK' },
              subscription: { id: 'test-subscription', close },
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

function setAgent(optionsByDid: Record<string, Partial<SyncIdentityOptions>> = {}): void {
  useAuthStore.setState({
    initialized: true,
    firstTime  : false,
    agent      : {
      agentDid: { uri: 'did:dht:agent' },
      identity: {
        getDwnEndpointStatus: vi.fn(async ({ didUri }: { didUri: string }) => ({
          status    : 'ready',
          didUri,
          endpoints : ['https://new.example'],
        })),
      },
      sync    : {
        getIdentityOptions: vi.fn(async (did: string) => {
          const options = optionsByDid[did];
          return options === undefined
            ? undefined
            : { protocols: [ProfileDefinition.protocol, ConnectDefinition.protocol], ...options };
        }),
        setIdentityOptions: vi.fn(async ({ did, options }: {
          did: string;
          options: SyncIdentityOptions;
        }) => {
          optionsByDid[did] = options;
        }),
        refreshIdentityRouting: vi.fn(async () => {}),
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

function serviceConfigEvent(tenantDid: string): SyncEvent {
  return {
    type           : 'delivery:applied',
    tenantDid,
    remoteEndpoint : 'https://old.example',
    messageCid     : 'service-config-cid',
    descriptor     : {
      interface    : 'Records',
      method       : 'Write',
      protocol     : ServiceConfigProtocolDefinition.protocol,
      protocolPath : 'serviceConfig',
      author       : tenantDid,
    },
  };
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
    expect(subscription?.request.filters).toBeUndefined();

    act(() => {
      emitMessage(subscription!, { interface: 'Records', method: 'Write' });
      vi.advanceTimersByTime(250);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
      exact: true,
    });

    unmount();
    expect(sdkMocks.closeFacade).toHaveBeenCalledOnce();
    expect(subscription?.close).toHaveBeenCalledOnce();
    expect(sdkMocks.syncListeners.size).toBe(0);
  });

  it('uses single-protocol subscriptions for a delegated identity', async () => {
    setAgent({ 'did:dht:owner': { delegateDid: 'did:dht:delegate' } });
    const queryClient = createQueryClient();
    renderHook(
      () => useSyncQueryInvalidation([{
        did      : { uri: 'did:dht:delegate' },
        metadata : { connectedDid: 'did:dht:owner' },
      }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    const identitySubscriptions = sdkMocks.subscriptions.filter(
      ({ connectedDid }) => connectedDid === 'did:dht:owner',
    );

    expect(identitySubscriptions).toHaveLength(2);
    expect(identitySubscriptions.map(({ request }) => request.filters?.[0]?.protocol)).toEqual(
      expect.arrayContaining([
        ProfileDefinition.protocol,
        ConnectDefinition.protocol,
      ]),
    );
    expect(identitySubscriptions.every(({ delegateDid }) => delegateDid === 'did:dht:delegate')).toBe(true);
  });

  it('does not open owner subscriptions for an unregistered delegate', async () => {
    setAgent();
    const queryClient = createQueryClient();
    renderHook(
      () => useSyncQueryInvalidation([{
        did      : { uri: 'did:dht:delegate' },
        metadata : { connectedDid: 'did:dht:owner' },
      }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    expect(sdkMocks.subscriptions).not.toContainEqual(
      expect.objectContaining({ connectedDid: 'did:dht:owner' }),
    );
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

  it('routes connect messages to permission queries', async () => {
    setAgent({ 'did:dht:identity': { delegateDid: 'did:dht:delegate' } });
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    const connectSubscription = sdkMocks.subscriptions.find(
      ({ request }) => request.filters?.[0]?.protocol === ConnectDefinition.protocol,
    );

    act(() => {
      emitMessage(connectSubscription!, {
        interface: 'Records',
        method   : 'Write',
        protocol : ConnectDefinition.protocol,
      });
      vi.advanceTimersByTime(250);
    });

    // Wallet records are no longer invalidated here — `WalletsTab` observes
    // them directly via `records.observe()`.
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
    expect(subscription?.request.filters).toBeUndefined();

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
      queryKey: queryKeys.identities.all,
      exact: true,
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it('freshly resolves and retargets sync after a service-config wake', async () => {
    const options = {
      protocols: [
        ProfileDefinition.protocol,
        ServiceConfigProtocolDefinition.protocol,
      ],
    };
    setAgent({ 'did:dht:agent': options });
    const agent = useAuthStore.getState().agent!;
    let resolveFirst!: (status: DwnEndpointResolution) => void;
    vi.mocked(agent.identity.getDwnEndpointStatus).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const adoptDwnEndpoints = vi.fn();
    renderHook(() => useSyncQueryInvalidation([], adoptDwnEndpoints), {
      wrapper: createWrapper(queryClient),
    });

    await settleSubscriptions();
    act(() => {
      emitSyncEvent(serviceConfigEvent('did:dht:agent'));
      emitSyncEvent(serviceConfigEvent('did:dht:agent'));
    });
    expect(agent.identity.getDwnEndpointStatus).toHaveBeenCalledOnce();
    resolveFirst({
      status    : 'ready',
      didUri    : 'did:dht:agent',
      endpoints : ['https://stale.example'],
    });
    await settleSubscriptions();

    expect(agent.identity.getDwnEndpointStatus).toHaveBeenCalledTimes(2);
    expect(agent.identity.getDwnEndpointStatus).toHaveBeenCalledWith({
      didUri  : 'did:dht:agent',
      refresh : true,
    });
    expect(agent.sync.refreshIdentityRouting).toHaveBeenCalledWith('did:dht:agent');
    expect(adoptDwnEndpoints).toHaveBeenCalledWith(['https://new.example']);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.dwnEndpoints('did:dht:agent'),
    });
  });

  it('adds service-config wakes to the agent DID sync scope once', async () => {
    setAgent({ 'did:dht:agent': { protocols: [ProfileDefinition.protocol] } });
    const agent = useAuthStore.getState().agent!;
    const queryClient = createQueryClient();
    renderHook(() => useSyncQueryInvalidation([]), {
      wrapper: createWrapper(queryClient),
    });

    await settleSubscriptions();
    expect(agent.sync.setIdentityOptions).toHaveBeenCalledWith({
      did     : 'did:dht:agent',
      options : {
        protocols: normalizeSyncProtocols([
          ProfileDefinition.protocol,
          ServiceConfigProtocolDefinition.protocol,
        ]),
      },
    });

    act(() => emitSyncEvent({
      type      : 'identity:registration-change',
      tenantDid : 'did:dht:agent',
      options   : {
        protocols: [
          ProfileDefinition.protocol,
          ServiceConfigProtocolDefinition.protocol,
        ],
      },
    }));
    await settleSubscriptions();
    expect(agent.sync.setIdentityOptions).toHaveBeenCalledOnce();
  });

  it('preserves existing routing when a fresh endpoint resolution fails', async () => {
    setAgent({ 'did:dht:identity': { protocols: [ProfileDefinition.protocol] } });
    const agent = useAuthStore.getState().agent!;
    vi.mocked(agent.identity.getDwnEndpointStatus).mockResolvedValue({
      status          : 'resolution-failed',
      didUri          : 'did:dht:identity',
      message         : 'Resolver unavailable',
      resolutionError : 'internalError',
    });
    const queryClient = createQueryClient();
    renderHook(
      () => useSyncQueryInvalidation([{ did: { uri: 'did:dht:identity' } }]),
      { wrapper: createWrapper(queryClient) },
    );

    await settleSubscriptions();
    act(() => emitSyncEvent(serviceConfigEvent('did:dht:identity')));
    await settleSubscriptions();

    expect(agent.sync.refreshIdentityRouting).not.toHaveBeenCalled();
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
