import type { ConnectPermissionRequest } from '@enbox/connect';
import {
  getContextCompanionRootUri,
  getScopeLabel,
  isContextCompanionDefinition,
} from '@/lib/module-names';

export type DisplayScope = {
  interface: string;
  method: string;
};

export type PermissionRisk = 'view' | 'edit' | 'delete' | 'other';

/**
 * `record` actions touch the user's records; `support` actions are the
 * plumbing an app needs to sync and check setup; `other` is anything the
 * wallet has no curated wording for (shown verbatim).
 */
export type PermissionActionKind = 'record' | 'support' | 'other';

export type PermissionAction = {
  key: string;
  label: string;
  phrase: string;
  risk: PermissionRisk;
  kind: PermissionActionKind;
  /** Exact DWN scope, for tooltips and technical disclosure. */
  scope: string;
};

const RECORD_PERMISSION_ACTIONS: Record<string, Omit<PermissionAction, 'key' | 'scope'>> = {
  Read: {
    label  : 'View',
    phrase : 'view',
    risk   : 'view',
    kind   : 'record',
  },
  Write: {
    label  : 'Add or edit',
    phrase : 'add or edit',
    risk   : 'edit',
    kind   : 'record',
  },
  Delete: {
    label  : 'Delete',
    phrase : 'delete',
    risk   : 'delete',
    kind   : 'record',
  },
};

const SUPPORT_PERMISSION_ACTIONS: Record<string, Omit<PermissionAction, 'key' | 'scope'>> = {
  'Messages.Read': {
    label  : 'Sync changes',
    phrase : 'sync changes from',
    risk   : 'view',
    kind   : 'support',
  },
  'Modules.Query': {
    label  : 'Inspect setup',
    phrase : 'inspect setup for',
    risk   : 'view',
    kind   : 'support',
  },
};

/** Stable reading order: view → edit → delete, then sync/setup, then the rest. */
const ACTION_ORDER = [
  'Records.Read',
  'Records.Write',
  'Records.Delete',
  'Messages.Read',
  'Modules.Query',
];

export function mergePermissionRequestsByModule(
  permissions: ConnectPermissionRequest[],
): ConnectPermissionRequest[] {
  const merged = new Map<string, ConnectPermissionRequest>();

  for (const permission of permissions) {
    const moduleUri = permission.moduleDefinition.module;
    const existing = merged.get(moduleUri);

    if (!existing) {
      merged.set(moduleUri, permission);
      continue;
    }

    merged.set(moduleUri, {
      ...existing,
      permissionScopes: [
        ...existing.permissionScopes,
        ...permission.permissionScopes,
      ],
    });
  }

  return [...merged.values()];
}

export function getPermissionActions(scopes: DisplayScope[]): PermissionAction[] {
  return scopes.map((scope) => {
    const key = `${scope.interface}.${scope.method}`;
    const action = scope.interface === 'Records'
      ? RECORD_PERMISSION_ACTIONS[scope.method]
      : SUPPORT_PERMISSION_ACTIONS[key];
    if (action) {
      return {
        ...action,
        key,
        scope: key,
      };
    }

    const label = getScopeLabel(scope);
    return {
      key,
      label,
      phrase : label,
      risk   : 'other',
      kind   : 'other',
      scope  : key,
    };
  });
}

/** De-duplicate scopes and order them for display. */
export function getSortedPermissionActions(scopes: DisplayScope[]): PermissionAction[] {
  const unique = new Map<string, DisplayScope>();
  for (const scope of scopes) {
    unique.set(`${scope.interface}.${scope.method}`, scope);
  }
  const rank = (key: string): number => {
    const index = ACTION_ORDER.indexOf(key);
    return index === -1 ? ACTION_ORDER.length : index;
  };
  return getPermissionActions([...unique.values()])
    .sort((left, right) => rank(left.key) - rank(right.key) || left.key.localeCompare(right.key));
}

export function formatList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export type GroupedPermissionRequest = {
  permission: ConnectPermissionRequest;
  companion?: ConnectPermissionRequest;
  isStandaloneCompanion: boolean;
};

/**
 * Pair verified `@enbox/contexts` `<root>/contexts` companion requests onto
 * their matching `<root>` domain request when both appear in the same ask.
 * Unverified `/contexts` definitions are never paired.
 */
export function groupPermissionRequestsWithCompanions(
  permissions: ConnectPermissionRequest[],
): GroupedPermissionRequest[] {
  const byModule = new Map<string, ConnectPermissionRequest>();
  const companionRequests = new WeakSet<ConnectPermissionRequest>();
  for (const permission of permissions) {
    byModule.set(permission.moduleDefinition.module, permission);
    if (isContextCompanionDefinition(permission.moduleDefinition)) {
      companionRequests.add(permission);
    }
  }

  const companionByRoot = new Map<string, ConnectPermissionRequest>();
  const pairedCompanionUris = new Set<string>();

  for (const permission of permissions) {
    if (!companionRequests.has(permission)) {
      continue;
    }
    const uri = permission.moduleDefinition.module;
    const rootUri = getContextCompanionRootUri(uri);
    const rootPermission = rootUri ? byModule.get(rootUri) : undefined;
    if (
      rootUri
      && rootPermission
      && !companionRequests.has(rootPermission)
      && !companionByRoot.has(rootUri)
    ) {
      companionByRoot.set(rootUri, permission);
      pairedCompanionUris.add(uri);
    }
  }

  const groups: GroupedPermissionRequest[] = [];
  for (const permission of permissions) {
    const uri = permission.moduleDefinition.module;
    if (pairedCompanionUris.has(uri)) {
      continue;
    }
    const companion = companionByRoot.get(uri);
    groups.push({
      permission,
      companion,
      isStandaloneCompanion: companion === undefined && companionRequests.has(permission),
    });
  }

  return groups;
}

/**
 * The actions a row shows. Next to real data access, sync and setup are
 * plumbing every app gets, so they move to one note under the list rather
 * than repeating on every row. Without data access they are the capability.
 */
export function visibleActions(actions: PermissionAction[]): PermissionAction[] {
  return actions.some((action) => action.kind === 'record')
    ? actions.filter((action) => action.kind === 'record')
    : actions;
}

/** Whether {@link visibleActions} left sync or setup out of a row. */
export function hidesSupportActions(actions: PermissionAction[]): boolean {
  return actions.some((action) => action.kind === 'record')
    && actions.some((action) => action.kind === 'support');
}
