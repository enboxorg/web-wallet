import type { DwnPermissionGrant } from '@enbox/agent';
import {
  buildPermissionSections,
  getConnectSession,
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

/**
 * Whether a verified origin has ever been granted access in this wallet, on
 * any profile, including sessions that have since expired or been revoked.
 * A look-alike site is always new, so a first connection is worth saying.
 * Pass full grant history, not just active grants.
 */
export function hasConnectedBefore(
  owners: ReadonlyArray<{ permissions: readonly DwnPermissionGrant[] }>,
  origin: string,
): boolean {
  return owners.some(({ permissions }) =>
    permissions.some((grant) => getConnectSession(grant)?.origin === origin)
  );
}
