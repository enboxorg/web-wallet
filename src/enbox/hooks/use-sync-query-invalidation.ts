import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileDefinition } from '@enbox/protocols';
import { Effect, Stream } from 'effect';

import { useAuthStore } from '@/stores/auth-store';

import { queryKeys } from '../queries/query-keys';
import { interruptEnboxFork, runEnboxFork } from '../effect/runtime';
import { WalletEventBus, type WalletEvent } from '../effect/wallet-events';

const INVALIDATION_DEBOUNCE_MS = 250;

function eventIncludesProtocol(event: any, protocol: string): boolean {
  if (event?.protocol === protocol) {
    return true;
  }

  return Array.isArray(event?.protocols) && event.protocols.includes(protocol);
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

export function useSyncQueryInvalidation(): void {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    if (!agent || typeof agent.sync?.on !== 'function') {
      return;
    }

    const pendingProfileDids = new Set<string>();
    let invalidateIdentities = false;

    function flush(): void {
      timerRef.current = undefined;

      if (invalidateIdentities) {
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
        invalidateIdentities = false;
      }

      for (const did of pendingProfileDids) {
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.profile(did) });
      }
      pendingProfileDids.clear();
    }

    function scheduleFlush(): void {
      if (timerRef.current) {
        return;
      }
      timerRef.current = setTimeout(flush, INVALIDATION_DEBOUNCE_MS);
    }

    const unsubscribe = agent.sync.on((event: any) => {
      if (event?.type !== 'checkpoint:pull-advance' && event?.type !== 'reconcile:applied') {
        return;
      }

      if (event.tenantDid === agent.agentDid?.uri) {
        invalidateIdentities = true;
        scheduleFlush();
      }

      if (eventIncludesProtocol(event, ProfileDefinition.protocol) && typeof event.tenantDid === 'string') {
        pendingProfileDids.add(event.tenantDid);
        scheduleFlush();
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [agent, queryClient]);
}
