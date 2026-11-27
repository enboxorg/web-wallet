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

export interface AllPermissionsOptions {
  /**
   * When `true` (default), also fetches non-revoked active grants to compute
   * `revokedGrantIds` (required for refresh detection). Set `false` when only
   * grant history is needed (e.g. first-connection detection) to skip N+1
   * per-grant revocation `RecordsRead` queries across every profile.
   */
  includeRevocations?: boolean;
}

/** Fetches grant history and (optionally) active grants for revocation diffing. */
export function useAllPermissions(
  ownerDids: string[],
  enabled: boolean,
  options: AllPermissionsOptions = {},
): AllPermissionsResult {
  const { includeRevocations = true } = options;
  const agent = useAuthStore((state) => state.agent);
  const canQuery = enabled && agent !== null;
  const queries = useQueries({
    queries: (enabled ? ownerDids : []).flatMap((ownerDid) => {
      const historyQuery = {
        queryKey : queryKeys.identities.permissionHistory(ownerDid),
        queryFn  : () => fetchPermissionHistory(agent!, ownerDid),
        enabled  : canQuery,
      };
      if (!includeRevocations) {
        return [historyQuery];
      }
      return [{
        queryKey : queryKeys.identities.permissions(ownerDid),
        queryFn  : () => fetchPermissions(agent!, ownerDid),
        enabled  : canQuery,
      }, historyQuery];
    }),
  });

  return {
    data: ownerDids.map((ownerDid, index) => {
      if (!includeRevocations) {
        const permissionHistory = queries[index]?.data ?? [];
        return {
          ownerDid,
          permissions     : permissionHistory,
          revokedGrantIds : [],
        };
      }

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
