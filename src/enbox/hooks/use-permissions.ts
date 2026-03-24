/**
 * Hook for fetching permission grants for a DID.
 */

import { useQuery } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import { fetchPermissions } from '../queries/identity-queries';

export function usePermissions(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.permissions(did),
    queryFn: () => fetchPermissions(agent, did),
    enabled: !!did,
  });
}
