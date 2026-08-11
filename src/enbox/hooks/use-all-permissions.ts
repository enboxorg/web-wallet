import { useQueries } from '@tanstack/react-query';
import type { DwnPermissionGrant } from '@enbox/agent';

import { useAuthStore } from '@/stores/auth-store';

import { fetchPermissionHistory, fetchPermissions } from '../queries/identity-queries';
import { queryKeys } from '../queries/query-keys';

export interface OwnerPermissionsResult {
  ownerDid: string;
  permissions: DwnPermissionGrant[];
  revokedGrantIds: string[];
}

export interface AllPermissionsResult {
  data: OwnerPermissionsResult[];
  isPending: boolean;
  isError: boolean;
}

/** Fetches active grants and isolated grant history for refresh detection. */
export function useAllPermissions(ownerDids: string[], enabled: boolean): AllPermissionsResult {
  const agent = useAuthStore((state) => state.agent);
  const canQuery = enabled && agent !== null;
  const queries = useQueries({
    queries: (enabled ? ownerDids : []).flatMap((ownerDid) => [{
      queryKey : queryKeys.identities.permissions(ownerDid),
      queryFn  : () => fetchPermissions(agent!, ownerDid),
      enabled  : canQuery,
    }, {
      queryKey : queryKeys.identities.permissionHistory(ownerDid),
      queryFn  : () => fetchPermissionHistory(agent!, ownerDid),
      enabled  : canQuery,
    }]),
  });

  return {
    data: ownerDids.map((ownerDid, index) => {
      const activePermissions = queries[index * 2]?.data ?? [];
      const permissionHistory = queries[index * 2 + 1]?.data ?? [];
      const activeGrantIds = new Set(activePermissions.map((grant) => grant.id));

      return {
        ownerDid,
        permissions     : permissionHistory,
        revokedGrantIds : permissionHistory
          .filter((grant) => !activeGrantIds.has(grant.id))
          .map((grant) => grant.id),
      };
    }),
    isPending : canQuery && queries.some((query) => query.isPending),
    isError   : enabled && (agent === null || queries.some((query) => query.isError)),
  };
}
