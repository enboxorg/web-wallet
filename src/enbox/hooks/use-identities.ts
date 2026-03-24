/**
 * Hook for fetching the list of identities managed by the agent.
 */

import { useQuery } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import { fetchIdentities } from '../queries/identity-queries';

export function useIdentities() {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.all,
    queryFn: () => fetchIdentities(agent),
  });
}
