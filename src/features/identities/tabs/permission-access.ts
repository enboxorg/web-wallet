import type { DwnPermissionGrant } from '@enbox/agent';

import {
  getSortedPermissionActions,
  type PermissionAction,
} from '@/components/connect/connect-scope-display';
import { getContextCompanionRootUri, getModuleName } from '@/lib/module-names';

/**
 * What one grantee may do with one resource: a module, optionally narrowed to
 * a record path or a single shared context. A connect approval stores one
 * grant per DWN scope (Records.Read, Records.Write, Messages.Read, …); this is
 * the user-facing unit those grants collapse into.
 */
export interface GrantAccessRow {
  key: string;
  module?: string;
  modulePath?: string;
  contextId?: string;
  actions: PermissionAction[];
  grants: DwnPermissionGrant[];
}

type ScopeFields = {
  interface?: string;
  method?: string;
  module?: string;
  modulePath?: string;
  contextId?: string;
};

export function isGrantActive(grant: DwnPermissionGrant, nowMs: number = Date.now()): boolean {
  const expiresAt = new Date(grant.dateExpires).getTime();
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

function sortKey(row: GrantAccessRow): string {
  if (!row.module) return '￿';
  const root = getContextCompanionRootUri(row.module);
  const name = getModuleName(root ?? row.module).toLowerCase();
  // Whole-module access first, then path-scoped, then single-context access.
  const narrowing = row.contextId ? 2 : row.modulePath ? 1 : 0;
  return [name, root ? 1 : 0, row.module, narrowing, row.modulePath ?? '', row.contextId ?? ''].join('\u0000');
}

/** Collapse per-scope grants into one row per module (+ path / context). */
export function groupGrantAccess(grants: DwnPermissionGrant[]): GrantAccessRow[] {
  const rows = new Map<string, {
    module?: string;
    modulePath?: string;
    contextId?: string;
    grants: DwnPermissionGrant[];
  }>();

  for (const grant of grants) {
    const scope = (grant.scope ?? {}) as ScopeFields;
    const key = [scope.module ?? '', scope.modulePath ?? '', scope.contextId ?? ''].join('\u0000');
    const row = rows.get(key);
    if (row) {
      row.grants.push(grant);
    } else {
      rows.set(key, {
        module     : scope.module,
        modulePath : scope.modulePath,
        contextId  : scope.contextId,
        grants     : [grant],
      });
    }
  }

  return [...rows.entries()]
    .map(([key, row]) => ({
      key,
      ...row,
      actions: getSortedPermissionActions(row.grants.flatMap((grant) => {
        const scope = (grant.scope ?? {}) as ScopeFields;
        return scope.interface && scope.method
          ? [{ interface: scope.interface, method: scope.method }]
          : [];
      })),
    }))
    .sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
}
