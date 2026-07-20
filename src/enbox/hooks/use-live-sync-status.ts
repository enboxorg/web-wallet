import type { ReplicationLinkSnapshot, RemoteSyncStatus, SyncEvent } from '@enbox/agent';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queries/query-keys';
import { useAgent } from './use-agent';

const STATUS_EVENT_COALESCE_MS = 500;
const STATUS_SAFETY_REFRESH_MS = 5 * 60_000;

/**
 * Reads live-sync health and link progress, refreshing from sync events rather
 * than polling the local stores every few seconds. The infrequent safety
 * refresh covers durable state changes that do not have a dedicated event.
 */
export function useLiveSyncStatus(did: string) {
  const agent = useAgent();
  const queryClient = useQueryClient();

  const remotes = useQuery<RemoteSyncStatus[]>({
    queryKey       : queryKeys.identities.syncRemotes(did),
    queryFn        : async () => agent.sync.getRemoteSyncStatus(did),
    enabled        : !!did,
    refetchInterval: STATUS_SAFETY_REFRESH_MS,
  });
  const links = useQuery<ReplicationLinkSnapshot[]>({
    queryKey       : queryKeys.identities.syncLinks(did),
    queryFn        : async () => agent.sync.getReplicationLinks(did),
    enabled        : !!did,
    refetchInterval: STATUS_SAFETY_REFRESH_MS,
  });

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = (): void => {
      refreshTimer = undefined;
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.syncRemotes(did) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.syncLinks(did) }),
      ]);
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

  return { links, remotes };
}

export function useRetryRemoteSync(did: string) {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (remoteEndpoint: string) => {
      await agent.sync.retryRemoteNow(did, remoteEndpoint);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.syncRemotes(did) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.syncLinks(did) }),
      ]);
    },
  });
}
