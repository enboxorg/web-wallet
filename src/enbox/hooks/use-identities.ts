/**
 * Hook for fetching the list of identities managed by the agent.
 *
 * Safe to call when the wallet is locked — the query is disabled
 * and returns undefined until the agent is available.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../queries/query-keys';
import { fetchIdentities } from '../queries/identity-queries';

export function useIdentities() {
  const agent = useAuthStore((s) => s.agent);

  return useQuery({
    queryKey: queryKeys.identities.all,
    queryFn: () => fetchIdentities(agent!),
    enabled: !!agent,
  });
}
