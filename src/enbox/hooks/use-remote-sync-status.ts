import type { RemoteSyncStatus } from '@enbox/agent';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queries/query-keys';
import { useAgent } from './use-agent';

const REMOTE_STATUS_REFRESH_MS = 10_000;

export function useRemoteSyncStatus(did: string) {
  const agent = useAgent();

  return useQuery<RemoteSyncStatus[]>({
    queryKey       : queryKeys.identities.syncRemotes(did),
    queryFn        : async () => agent.sync.getRemoteSyncStatus(did),
    enabled        : !!did,
    refetchInterval: REMOTE_STATUS_REFRESH_MS,
  });
}

export function useRetryRemoteSync(did: string) {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (remoteEndpoint: string) => {
      await agent.sync.retryRemoteNow(did, remoteEndpoint);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.identities.syncRemotes(did),
      });
    },
  });
}
