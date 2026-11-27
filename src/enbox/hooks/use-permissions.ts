/**
 * Hook for fetching permission grants for a DID.
 *
 * Safe to call when the wallet is locked — the query is disabled
 * until the agent is available (needed by the dweb-connect page,
 * which renders before onboarding completes).
 */

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import { queryKeys } from '../queries/query-keys';
import { fetchPermissions } from '../queries/identity-queries';

export function usePermissions(did: string, options: { activeOnly?: boolean } = {}) {
  const { activeOnly = false } = options;
  const agent = useAuthStore((s) => s.agent);

  return useQuery({
    queryKey: activeOnly
      ? queryKeys.identities.activePermissions(did)
      : queryKeys.identities.permissions(did),
    queryFn: () => fetchPermissions(agent!, did, { activeOnly }),
    enabled: !!did && !!agent,
  });
}
