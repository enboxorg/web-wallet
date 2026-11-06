import type { ConnectPermissionRequest } from '@enbox/connect';
import { getCanonicalModuleDefinition, getModuleInfo } from '@/lib/module-names';
import { moduleDefinitionsMatch } from '@/features/connect/module-install';
import {
  formatActionPhrase,
  formatList,
  getDisplayScopes,
  getPermissionActions,
  mergePermissionRequestsByModule,
} from './connect-scope-display';

function getPermissionActionPhrase(
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): string {
  return formatActionPhrase(
    getPermissionActions(getDisplayScopes(permissionScopes)),
  );
}

function isCanonicalModule(permission: ConnectPermissionRequest): boolean {
  const definition = permission.moduleDefinition;
  const canonical = getCanonicalModuleDefinition(definition.module);
  return canonical !== undefined && moduleDefinitionsMatch(canonical, definition);
}

function getPermissionObjectPhrase(permission: ConnectPermissionRequest): string {
  const moduleUri = permission.moduleDefinition.module;
  if (!isCanonicalModule(permission)) {
    return 'a custom data type';
  }

  return `your ${getModuleInfo(moduleUri).name}`;
}

function getVisiblePermissionObjectPhrases(
  permissions: ConnectPermissionRequest[],
): string[] {
  const visiblePermissions = permissions.slice(0, 2);
  if (
    visiblePermissions.length > 0
    && visiblePermissions.every((permission) => !isCanonicalModule(permission))
  ) {
    return [
      visiblePermissions.length === 1
        ? 'a custom data type'
        : `${visiblePermissions.length} custom data types`,
    ];
  }

  return visiblePermissions.map((permission) =>
    isCanonicalModule(permission)
      ? getModuleInfo(permission.moduleDefinition.module).name
      : 'a custom data type'
  );
}

export function getConnectPermissionAskSummary(
  permissions: ConnectPermissionRequest[],
): string {
  const displayPermissions = mergePermissionRequestsByModule(permissions)
    .filter(permission => permission.permissionScopes.length > 0);

  if (displayPermissions.length === 0) {
    return 'wants to connect.';
  }

  if (displayPermissions.length <= 2) {
    const phrases = displayPermissions.map((permission) => {
      return `${getPermissionActionPhrase(permission.permissionScopes)} ${getPermissionObjectPhrase(permission)}`;
    });

    return `wants to ${formatList(phrases)}.`;
  }

  const visibleCount = Math.min(displayPermissions.length, 2);
  const visibleNames = getVisiblePermissionObjectPhrases(displayPermissions);
  const remaining = displayPermissions.length - visibleCount;

  return `wants access to ${formatList([...visibleNames, `${remaining} more`])}.`;
}
