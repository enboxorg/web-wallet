/**
 * Hook for fetching installed protocols for a DID.
 */

import { useQuery } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import { fetchProtocols } from '../queries/identity-queries';

export function useProtocols(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.protocols(did),
    queryFn: () => fetchProtocols(agent, did),
    enabled: !!did,
  });
}
