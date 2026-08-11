import type { SyncEvent, SyncIdentityStatus } from '@enbox/agent';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queries/query-keys';
import { useAgent } from './use-agent';

const STATUS_EVENT_COALESCE_MS = 500;
const STATUS_SAFETY_REFRESH_MS = 5 * 60_000;

/**
 * Reads one identity's live-sync status, refreshing from scoped sync events.
 * The infrequent safety read also covers mutations made by another browser
 * context, whose engine-local health events are not delivered to this tab.
 */
export function useLiveSyncStatus(did: string) {
  const agent = useAgent();
  const queryClient = useQueryClient();

  const status = useQuery<SyncIdentityStatus>({
    queryKey       : queryKeys.identities.syncStatus(did),
    queryFn        : async () => agent.sync.getIdentitySyncStatus(did),
    enabled        : !!did,
    refetchInterval: STATUS_SAFETY_REFRESH_MS,
  });

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = (): void => {
      refreshTimer = undefined;
      void queryClient.invalidateQueries({ queryKey: queryKeys.identities.syncStatus(did) });
    };

    const unsubscribe = agent.sync.on((event: SyncEvent): void => {
      if (event.tenantDid !== did || refreshTimer !== undefined) {
        return;
      }
      refreshTimer = setTimeout(flush, STATUS_EVENT_COALESCE_MS);
    });

    return (): void => {
      unsubscribe();
      if (refreshTimer !== undefined) {
        clearTimeout(refreshTimer);
      }
    };
  }, [agent, did, queryClient]);

  return status;
}

export function useRetryRemoteSync(did: string) {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (remoteEndpoint: string) => {
      await agent.sync.retryRemoteNow(did, remoteEndpoint);
    },
    onSuccess: async () => queryClient.invalidateQueries({
      queryKey: queryKeys.identities.syncStatus(did),
    }),
  });
}
