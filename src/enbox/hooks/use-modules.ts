/**
 * Hook for fetching installed modules for a DID.
 */

import { useQuery } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import { fetchModules } from '../queries/identity-queries';

export function useModules(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.modules(did),
    queryFn: () => fetchModules(agent, did),
    enabled: !!did,
  });
}
