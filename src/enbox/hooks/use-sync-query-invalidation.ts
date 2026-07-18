import type { MessageChange, MessagesLiveQuery } from '@enbox/api';

import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Enbox } from '@enbox/api';
import { ConnectDefinition, ProfileDefinition, SocialGraphDefinition } from '@enbox/protocols';
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
  audienceDeliveries: Set<string>;
  permissions: Set<string>;
  profiles: Set<string>;
  protocols: Set<string>;
  socialGraphs: Set<string>;
  wallets: Set<string>;
};

function createPendingInvalidations(): PendingInvalidations {
  return {
    identities  : false,
    activity    : new Set(),
    audienceDeliveries: new Set(),
    permissions : new Set(),
    profiles    : new Set(),
    protocols   : new Set(),
    socialGraphs: new Set(),
    wallets     : new Set(),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
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

function queueIdentityMessage(
  change: MessageChange,
  did: string,
  pending: PendingInvalidations,
): void {
  const { descriptor } = change;
  pending.activity.add(did);

  if (descriptor.interface === 'Protocols') {
    pending.protocols.add(did);
    pending.audienceDeliveries.add(did);
  }

  if (descriptor.interface === 'Permissions') {
    pending.permissions.add(did);
  }

  if (descriptor.protocol !== undefined) {
    pending.audienceDeliveries.add(did);
  }

  switch (descriptor.protocol) {
    case ProfileDefinition.protocol:
      pending.profiles.add(did);
      pending.identities = true;
      break;

    case SocialGraphDefinition.protocol:
      pending.socialGraphs.add(did);
      break;

    case ConnectDefinition.protocol:
      pending.wallets.add(did);
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

    const pending = createPendingInvalidations();
    const liveQueries: MessagesLiveQuery[] = [];
    const removeListeners: Array<() => void> = [];
    let cancelled = false;
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    function flush(): void {
      flushTimer = undefined;

      if (pending.identities) {
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
        pending.identities = false;
      }

      const invalidations = [
        [pending.activity, queryKeys.identities.activity],
        [pending.audienceDeliveries, queryKeys.identities.audienceDeliveries],
        [pending.permissions, queryKeys.identities.permissions],
        [pending.profiles, queryKeys.identities.profile],
        [pending.protocols, queryKeys.identities.protocols],
        [pending.socialGraphs, queryKeys.identities.socialGraph],
        [pending.wallets, queryKeys.identities.wallets],
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
        const { status, liveQuery } = await enbox.dwn.messages.subscribe(
          protocol === undefined ? {} : { filters: [{ protocol }] },
        );

        if (cancelled) {
          await liveQuery?.close();
          return;
        }

        if (!liveQuery || status.code >= 300) {
          console.warn(
            `Message subscription failed for ${did ?? 'the agent DID'}${protocol ? ` (${protocol})` : ''}: ${status.code} ${status.detail}`,
          );
          return;
        }

        liveQueries.push(liveQuery);
        removeListeners.push(liveQuery.on('event', (change) => {
          if (did === undefined) {
            pending.identities = true;
          } else {
            queueIdentityMessage(change, did, pending);
          }
          scheduleFlush();
        }));
        removeListeners.push(liveQuery.on('error', (error) => {
          console.warn(
            `Message subscription ended for ${did ?? 'the agent DID'}${protocol ? ` (${protocol})` : ''}: ${error.code} ${error.detail}`,
          );
        }));
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
      const syncOptions = typeof agent.sync?.getIdentityOptions === 'function'
        ? await agent.sync.getIdentityOptions(did)
        : undefined;
      const enbox = new Enbox({
        agent,
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
    const subscriptions = identityDids.map(subscribeIdentity);
    const agentDid = agent.agentDid?.uri;
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
      for (const liveQuery of liveQueries) {
        void liveQuery.close().catch((error) => {
          console.warn('Unable to close message subscription:', error);
        });
      }
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
      }
    };
  }, [agent, identityTargetKey, queryClient]);
}
