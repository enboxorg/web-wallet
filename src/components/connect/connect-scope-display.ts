import type { ConnectPermissionRequest, DwnPermissionScope } from '@enbox/agent';
import { getScopeLabel } from '@/lib/protocol-names';

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

export function isInternalConnectScope(scope: DwnPermissionScope): boolean {
  return (
    (scope?.interface === 'Protocols' && scope?.method === 'Query')
    || (scope?.interface === 'Messages' && scope?.method === 'Read')
  );
}

export function getDisplayScopes(
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): DisplayScope[] {
  const scopes = new Map<string, DisplayScope>();

  for (const scope of permissionScopes) {
    if (isInternalConnectScope(scope)) continue;

    const scopeInterface = scope.interface;
    const method = scope.method;
    const key = `${scopeInterface}.${method}`;
    scopes.set(key, { interface: scopeInterface, method });
  }

  return [...scopes.values()];
}

export function mergePermissionRequestsByProtocol(
  permissions: ConnectPermissionRequest[],
): ConnectPermissionRequest[] {
  const merged = new Map<string, ConnectPermissionRequest>();

  for (const permission of permissions) {
    const protocolUri = permission.protocolDefinition.protocol;
    const existing = merged.get(protocolUri);

    if (!existing) {
      merged.set(protocolUri, permission);
      continue;
    }

    merged.set(protocolUri, {
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
    if (scope.interface === 'Records' && RECORD_PERMISSION_ACTIONS[scope.method]) {
      const action = RECORD_PERMISSION_ACTIONS[scope.method];
      return {
        ...action,
        key: `${scope.interface}.${scope.method}`,
      };
    }

    const label = getScopeLabel(scope);
    return {
      key    : `${scope.interface}.${scope.method}`,
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

export function formatActionPhrase(actions: PermissionAction[]): string {
  const phrases = actions.length > 0
    ? actions.map((action) => action.phrase)
    : ['use'];
  return formatList(phrases);
}
