import type { DwnSubscriptionMessage } from '@enbox/dwn-clients';
import type { SyncEvent, SyncMessageDescriptor } from '@enbox/agent';

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Enbox } from '@enbox/api';
import { ConnectDefinition, ProfileDefinition } from '@enbox/protocols';
import { Effect, Stream } from 'effect';

import { useAuthStore } from '@/stores/auth-store';

import { getIdentityDid } from '../identity-sync';
import { IDENTITY_SYNC_PROTOCOLS } from '../protocols';
import { queryKeys } from '../queries/query-keys';
import { interruptEnboxFork, runEnboxFork } from '../effect/runtime';
import { WalletEventBus, type WalletEvent } from '../effect/wallet-events';

const INVALIDATION_DEBOUNCE_MS = 250;

type PendingInvalidations = {
  identities: boolean;
  activity: Set<string>;
  permissions: Set<string>;
  profiles: Set<string>;
  protocols: Set<string>;
};

function createPendingInvalidations(): PendingInvalidations {
  return {
    identities  : false,
    activity    : new Set(),
    permissions : new Set(),
    profiles    : new Set(),
    protocols   : new Set(),
  };
}

function invalidateWalletEventQueries(
  event: WalletEvent,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  switch (event._tag) {
    case 'identity.created':
    case 'identity.imported':
    case 'identity.deleted':
    case 'identity.connected':
    case 'identity.disconnected':
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
      break;

    case 'identity.profile.updated':
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.profile(event.did) });
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all, exact: true });
      break;

    case 'identity.dwnEndpoints.updated':
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.dwnEndpoints(event.did) });
      break;

    case 'connect.approved':
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissions(event.connectedDid) });
      break;

    case 'connect.denied':
      break;
  }
}

function queueIdentityDescriptor(
  descriptor: Pick<SyncMessageDescriptor, 'interface' | 'protocol'>,
  did: string,
  pending: PendingInvalidations,
): void {
  pending.activity.add(did);

  if (descriptor.interface === 'Protocols') {
    pending.protocols.add(did);
  }

  if (descriptor.interface === 'Permissions') {
    pending.permissions.add(did);
  }

  switch (descriptor.protocol) {
    case ProfileDefinition.protocol:
      pending.profiles.add(did);
      pending.identities = true;
      break;

    case ConnectDefinition.protocol:
      pending.permissions.add(did);
      break;
  }
}

/**
 * Keep React Query caches aligned with local DWN writes, sync-applied messages,
 * and cross-tab changes. Message subscriptions are protocol-scoped for
 * delegated identities because delegated MessagesSubscribe grants are scoped
 * to exactly one protocol.
 */
export function useSyncQueryInvalidation(identities: unknown[] | undefined): void {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const identityTargetKey = useMemo(() => {
    const targets = new Map<string, string | undefined>();
    for (const identity of identities ?? []) {
      const connectedDid = getIdentityDid(identity);
      if (!connectedDid) {
        continue;
      }
      const identityDid = (identity as { did?: { uri?: unknown } })?.did?.uri;
      targets.set(connectedDid, typeof identityDid === 'string' ? identityDid : undefined);
    }
    return JSON.stringify(
      [...targets].sort(([left], [right]) => left.localeCompare(right)),
    );
  }, [identities]);

  useEffect(() => {
    const fiber = runEnboxFork(
      Effect.flatMap(WalletEventBus, (bus) =>
        bus.stream.pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => invalidateWalletEventQueries(event, queryClient))
          ),
        )
      ),
    );

    return () => interruptEnboxFork(fiber);
  }, [queryClient]);

  useEffect(() => {
    if (!agent) {
      return;
    }
    const currentAgent = agent;

    const pending = createPendingInvalidations();
    const messageSubscriptions: Array<{ close: () => Promise<void> }> = [];
    const removeListeners: Array<() => void> = [];
    let cancelled = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    function flush(): void {
      flushTimer = undefined;

      if (pending.identities) {
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.all, exact: true });
        pending.identities = false;
      }

      const invalidations = [
        [pending.activity, queryKeys.identities.activity],
        [pending.permissions, queryKeys.identities.permissions],
        [pending.profiles, queryKeys.identities.profile],
        [pending.protocols, queryKeys.identities.protocols],
      ] as const;

      for (const [dids, queryKey] of invalidations) {
        for (const did of dids) {
          queryClient.invalidateQueries({ queryKey: queryKey(did) });
        }
        dids.clear();
      }
    }

    function scheduleFlush(): void {
      if (flushTimer === undefined) {
        flushTimer = setTimeout(flush, INVALIDATION_DEBOUNCE_MS);
      }
    }

    async function openSubscription(
      enbox: Enbox,
      did: string | undefined,
      protocol?: string,
    ): Promise<void> {
      try {
        // The subscription handler must be supplied at dispatch time — the old
        // MessagesLiveQuery buffered dispatches until a listener attached, and
        // that buffering is gone, so a late handler would drop catch-up events.
        const { status, subscription } = await enbox.dwn.messages.subscribe({
          ...(protocol === undefined ? {} : { filters: [{ protocol }] }),
          subscriptionHandler: (message: DwnSubscriptionMessage): void => {
            if (cancelled) {
              return;
            }
            if (message.type === 'event') {
              if (did === undefined) {
                pending.identities = true;
              } else {
                queueIdentityDescriptor(
                  message.event.message.descriptor as SyncMessageDescriptor,
                  did,
                  pending,
                );
              }
              scheduleFlush();
              return;
            }
            if (message.type === 'error') {
              console.warn(
                `Message subscription ended for ${did ?? 'the agent DID'}${protocol ? ` (${protocol})` : ''}:`,
                message.error,
              );
            }
          },
        });

        if (cancelled) {
          await subscription?.close();
          return;
        }

        if (!subscription || status.code >= 300) {
          console.warn(
            `Message subscription failed for ${did ?? 'the agent DID'}${protocol ? ` (${protocol})` : ''}: ${status.code} ${status.detail}`,
          );
          return;
        }

        messageSubscriptions.push(subscription);
      } catch (error) {
        if (!cancelled) {
          console.warn(
            `Unable to subscribe to messages for ${did ?? 'the agent DID'}${protocol ? ` (${protocol})` : ''}:`,
            error,
          );
        }
      }
    }

    async function subscribeIdentity(did: string): Promise<void> {
      const syncOptions = typeof currentAgent.sync?.getIdentityOptions === 'function'
        ? await currentAgent.sync.getIdentityOptions(did)
        : undefined;
      const enbox = new Enbox({
        agent: currentAgent,
        connectedDid: did,
        ...(syncOptions?.delegateDid && { delegateDid: syncOptions.delegateDid }),
      });

      if (!syncOptions?.delegateDid) {
        await openSubscription(enbox, did);
        return;
      }

      await Promise.all(
        IDENTITY_SYNC_PROTOCOLS.map((protocol) => openSubscription(enbox, did, protocol)),
      );
    }

    const identityDids = (JSON.parse(identityTargetKey) as Array<[string, string | undefined]>)
      .map(([connectedDid]) => connectedDid);
    const identityDidSet = new Set(identityDids);
    const agentDid = agent.agentDid?.uri;
    removeListeners.push(agent.sync.on((event: SyncEvent): void => {
      if (event.tenantDid === agentDid) {
        if (event.type === 'delivery:applied') {
          pending.identities = true;
          scheduleFlush();
        }
        return;
      }
      if (!identityDidSet.has(event.tenantDid)) {
        return;
      }
      if (event.type === 'delivery:applied') {
        queueIdentityDescriptor(event.descriptor, event.tenantDid, pending);
        scheduleFlush();
      }
    }));

    const subscriptions = identityDids.map(subscribeIdentity);
    if (typeof agentDid === 'string' && agentDid.length > 0) {
      subscriptions.push(openSubscription(new Enbox({ agent, connectedDid: agentDid }), undefined));
    }
    void Promise.all(subscriptions).catch((error) => {
      if (!cancelled) {
        console.warn('Unable to establish one or more message subscriptions:', error);
      }
    });

    return () => {
      cancelled = true;
      for (const removeListener of removeListeners) {
        removeListener();
      }
      for (const subscription of messageSubscriptions) {
        void subscription.close().catch((error) => {
          console.warn('Unable to close message subscription:', error);
        });
      }
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
      }
    };
  }, [agent, identityTargetKey, queryClient]);
}
