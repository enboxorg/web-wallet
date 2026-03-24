/**
 * Hook for fetching DWN service endpoints for a DID.
 */

import { useQuery } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import { fetchDwnEndpoints } from '../queries/identity-queries';

export function useDwnEndpoints(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.dwnEndpoints(did),
    queryFn: () => fetchDwnEndpoints(agent, did),
    enabled: !!did,
  });
}
