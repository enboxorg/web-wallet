import type { ConnectPermissionRequest } from '@enbox/agent';
import { getProtocolInfo, isKnownProtocol } from '@/lib/protocol-names';
import {
  formatActionPhrase,
  formatList,
  getDisplayScopes,
  getPermissionActions,
  mergePermissionRequestsByProtocol,
} from './connect-scope-display';

function getPermissionActionPhrase(
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): string {
  return formatActionPhrase(
    getPermissionActions(getDisplayScopes(permissionScopes)),
  );
}

function getPermissionObjectPhrase(permission: ConnectPermissionRequest): string {
  const protocolUri = permission.protocolDefinition.protocol;
  if (!isKnownProtocol(protocolUri)) {
    return 'a custom data type';
  }

  return `your ${getProtocolInfo(protocolUri).name}`;
}

function getVisiblePermissionObjectPhrases(
  permissions: ConnectPermissionRequest[],
): string[] {
  const visiblePermissions = permissions.slice(0, 2);
  if (
    visiblePermissions.length > 0
    && visiblePermissions.every((permission) => !isKnownProtocol(permission.protocolDefinition.protocol))
  ) {
    return [
      visiblePermissions.length === 1
        ? 'a custom data type'
        : `${visiblePermissions.length} custom data types`,
    ];
  }

  return visiblePermissions.map((permission) =>
    isKnownProtocol(permission.protocolDefinition.protocol)
      ? getProtocolInfo(permission.protocolDefinition.protocol).name
      : 'a custom data type'
  );
}

export function getConnectPermissionAskSummary(
  permissions: ConnectPermissionRequest[],
): string {
  const displayPermissions = mergePermissionRequestsByProtocol(permissions);

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
