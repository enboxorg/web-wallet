import { useQueries } from '@tanstack/react-query';
import type { DwnPermissionGrant } from '@enbox/agent';

import { useAuthStore } from '@/stores/auth-store';

import { fetchPermissions } from '../queries/identity-queries';
import { queryKeys } from '../queries/query-keys';

export interface OwnerPermissionsResult {
  ownerDid: string;
  permissions: DwnPermissionGrant[];
}

export interface AllPermissionsResult {
  data: OwnerPermissionsResult[];
  isPending: boolean;
  isError: boolean;
}

/** Fetches permission grants for every supplied wallet identity. */
export function useAllPermissions(ownerDids: string[], enabled: boolean): AllPermissionsResult {
  const agent = useAuthStore((state) => state.agent);
  const canQuery = enabled && agent !== null;
  const queries = useQueries({
    queries: (enabled ? ownerDids : []).map((ownerDid) => ({
      queryKey : queryKeys.identities.permissions(ownerDid),
      queryFn  : () => fetchPermissions(agent!, ownerDid),
      enabled  : canQuery,
    })),
  });

  return {
    data: ownerDids.map((ownerDid, index) => ({
      ownerDid,
      permissions: queries[index]?.data ?? [],
    })),
    isPending : canQuery && queries.some((query) => query.isPending),
    isError   : enabled && (agent === null || queries.some((query) => query.isError)),
  };
}
