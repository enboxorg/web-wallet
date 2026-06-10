import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ProfileDefinition } from '@enbox/protocols';

import { useAuthStore } from '@/stores/auth-store';

import { queryKeys } from '../queries/query-keys';

const INVALIDATION_DEBOUNCE_MS = 250;

export function useSyncQueryInvalidation(): void {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

      if (event.protocol === ProfileDefinition.protocol && typeof event.tenantDid === 'string') {
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
