import type { DwnPermissionGrant } from '@enbox/agent';
import {
  buildPermissionSections,
  type PermissionSessionGroup,
} from '@/features/identities/tabs/permission-sessions';

export interface ConnectSessionRequestIdentity {
  origin?: string;
  appName?: string;
}

function matchesRequestIdentity(
  session: PermissionSessionGroup['session'],
  request: ConnectSessionRequestIdentity,
): boolean {
  if (request.origin) {
    return session.origin === request.origin;
  }

  return Boolean(
    request.appName && session.appName === request.appName,
  );
}

export function findMatchingActiveConnectSessions(
  permissions: DwnPermissionGrant[] | undefined,
  request: ConnectSessionRequestIdentity,
  now = new Date(),
): PermissionSessionGroup[] {
  if (!request.origin && !request.appName) {
    return [];
  }

  return buildPermissionSections(permissions, now).activeSessions.filter((sessionGroup) =>
    matchesRequestIdentity(sessionGroup.session, request),
  );
}
