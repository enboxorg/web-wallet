import type { ConnectPermissionRequest } from '@enbox/connect';
import { getModuleInfo, isCanonicalModuleDefinition } from '@/lib/module-names';
import {
  formatActionPhrase,
  formatList,
  formatModuleObjectPhrase,
  getDisplayScopes,
  getPermissionActions,
  groupPermissionRequestsWithCompanions,
  mergePermissionRequestsByModule,
  type GroupedPermissionRequest,
} from './connect-scope-display';

function getPermissionActionPhrase(
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): string {
  return formatActionPhrase(
    getPermissionActions(getDisplayScopes(permissionScopes)),
  );
}

function getPermissionObjectPhrase(group: GroupedPermissionRequest): string {
  const definition = group.permission.moduleDefinition;
  const isKnownModule = !group.isStandaloneCompanion && isCanonicalModuleDefinition(definition);
  return formatModuleObjectPhrase({
    isContextCompanion : group.isStandaloneCompanion,
    isKnownModule,
    moduleName         : isKnownModule ? getModuleInfo(definition.module).name : undefined,
  });
}

function formatGroupAskPhrase(group: GroupedPermissionRequest): string {
  const rootActionPhrase = getPermissionActionPhrase(group.permission.permissionScopes);
  const objectPhrase = getPermissionObjectPhrase(group);
  if (!group.companion) {
    return `${rootActionPhrase} ${objectPhrase}`;
  }

  const companionActionPhrase = getPermissionActionPhrase(group.companion.permissionScopes);
  if (companionActionPhrase === rootActionPhrase) {
    return `${rootActionPhrase} ${objectPhrase} and its shared contexts`;
  }

  return `${rootActionPhrase} ${objectPhrase} and ${companionActionPhrase} its shared contexts`;
}

function isUnnamedCustomGroup(group: GroupedPermissionRequest): boolean {
  return !group.isStandaloneCompanion
    && !group.companion
    && !isCanonicalModuleDefinition(group.permission.moduleDefinition);
}

function getVisibleGroupObjectPhrases(
  groups: GroupedPermissionRequest[],
): string[] {
  const visibleGroups = groups.slice(0, 2);
  if (
    visibleGroups.length > 0
    && visibleGroups.every(isUnnamedCustomGroup)
  ) {
    return [
      visibleGroups.length === 1
        ? 'a custom data type'
        : `${visibleGroups.length} custom data types`,
    ];
  }

  return visibleGroups.map((group) => {
    if (group.isStandaloneCompanion) {
      return 'Shared contexts';
    }
    const baseName = isCanonicalModuleDefinition(group.permission.moduleDefinition)
      ? getModuleInfo(group.permission.moduleDefinition.module).name
      : 'a custom data type';
    return group.companion ? `${baseName} (with shared contexts)` : baseName;
  });
}

export function getConnectPermissionAskSummary(
  permissions: ConnectPermissionRequest[],
): string {
  const displayPermissions = mergePermissionRequestsByModule(permissions)
    .filter(permission => permission.permissionScopes.length > 0);
  const displayGroups = groupPermissionRequestsWithCompanions(displayPermissions);

  if (displayGroups.length === 0) {
    return 'wants to connect.';
  }

  if (displayGroups.length <= 2) {
    const phrases = displayGroups.map(formatGroupAskPhrase);
    return `wants to ${formatList(phrases)}.`;
  }

  const visibleCount = Math.min(displayGroups.length, 2);
  const visibleNames = getVisibleGroupObjectPhrases(displayGroups);
  const remaining = displayGroups.length - visibleCount;

  return `wants access to ${formatList([...visibleNames, `${remaining} more`])}.`;
}
