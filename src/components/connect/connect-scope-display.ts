import type { DwnPermissionScope } from '@enbox/agent';
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

export type PermissionAction = {
  key: string;
  label: string;
  phrase: string;
  risk: PermissionRisk;
};

const RECORD_PERMISSION_ACTIONS: Record<string, Omit<PermissionAction, 'key'>> = {
  Read: {
    label  : 'View',
    phrase : 'view',
    risk   : 'view',
  },
  Write: {
    label  : 'Add or edit',
    phrase : 'add or edit',
    risk   : 'edit',
  },
  Delete: {
    label  : 'Delete',
    phrase : 'delete',
    risk   : 'delete',
  },
};

const SUPPORT_PERMISSION_ACTIONS: Record<string, Omit<PermissionAction, 'key'>> = {
  'Messages.Read': {
    label  : 'View messages',
    phrase : 'view messages from',
    risk   : 'view',
  },
  'Modules.Query': {
    label  : 'Inspect setup',
    phrase : 'inspect setup for',
    risk   : 'view',
  },
};

export function isInternalConnectScope(scope: DwnPermissionScope): boolean {
  return (
    (scope?.interface === 'Modules' && scope?.method === 'Query')
    || (scope?.interface === 'Messages' && scope?.method === 'Read')
  );
}

export function getDisplayScopes(
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): DisplayScope[] {
  const scopes = new Map<string, DisplayScope>();
  const supportScopes = new Map<string, DisplayScope>();

  for (const scope of permissionScopes) {
    const scopeInterface = scope.interface;
    const method = scope.method;
    const key = `${scopeInterface}.${method}`;
    const target = isInternalConnectScope(scope) ? supportScopes : scopes;
    target.set(key, { interface: scopeInterface, method });
  }

  return [...(scopes.size > 0 ? scopes : supportScopes).values()];
}

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
      };
    }

    const label = getScopeLabel(scope);
    return {
      key,
      label,
      phrase : label,
      risk   : 'other',
    };
  });
}

export function getHighestPermissionRisk(actions: PermissionAction[]): PermissionRisk {
  if (actions.some((action) => action.risk === 'delete')) return 'delete';
  if (actions.some((action) => action.risk === 'edit')) return 'edit';
  if (actions.some((action) => action.risk === 'view')) return 'view';
  return 'other';
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

export function formatModuleObjectPhrase(options: {
  isContextCompanion: boolean;
  isKnownModule: boolean;
  moduleName?: string;
}): string {
  if (options.isContextCompanion) {
    return 'shared context invitations and followed contexts';
  }
  if (options.isKnownModule && options.moduleName) {
    return `your ${options.moduleName}`;
  }
  return 'a custom data type';
}

export function formatActionPhrase(actions: PermissionAction[]): string {
  const phrases = actions.length > 0
    ? actions.map((action) => action.phrase)
    : ['use'];
  return formatList(phrases);
}
