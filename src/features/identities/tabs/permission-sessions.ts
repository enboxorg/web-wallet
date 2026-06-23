import type { PermissionGrant } from '@enbox/api';
import type { ConnectSessionMetadata } from '@enbox/agent';

export type PermissionGrantWithSession = PermissionGrant & {
  connectSession?: ConnectSessionMetadata;
};

export interface PermissionSessionGroup {
  id: string;
  session: ConnectSessionMetadata;
  grantee: string;
  grants: PermissionGrant[];
  dateGranted?: string;
  dateExpires: string;
  active: boolean;
}

export interface PermissionGranteeGroup {
  grantee: string;
  grants: PermissionGrant[];
}

export interface PermissionSections {
  activeSessions: PermissionSessionGroup[];
  inactiveSessions: PermissionSessionGroup[];
  standaloneGroups: PermissionGranteeGroup[];
}

function getConnectSession(grant: PermissionGrant): ConnectSessionMetadata | undefined {
  const session = (grant as PermissionGrantWithSession).connectSession;
  if (!session?.id || !session.createdAt || !session.expiresAt) {
    return undefined;
  }
  return session;
}

function timestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function earliestDate(values: Array<string | undefined>): string | undefined {
  const times = values
    .map(timestamp)
    .filter((time): time is number => time !== undefined);
  if (times.length === 0) return undefined;
  return new Date(Math.min(...times)).toISOString();
}

function latestDate(values: Array<string | undefined>): string | undefined {
  const times = values
    .map(timestamp)
    .filter((time): time is number => time !== undefined);
  if (times.length === 0) return undefined;
  return new Date(Math.max(...times)).toISOString();
}

function toSessionGroup(
  id: string,
  session: ConnectSessionMetadata,
  grants: PermissionGrant[],
  nowMs: number,
): PermissionSessionGroup {
  const dateExpires = earliestDate(grants.map((grant) => grant.dateExpires))
    ?? session.expiresAt;
  const expiryTime = timestamp(dateExpires) ?? timestamp(session.expiresAt) ?? 0;

  return {
    id,
    session,
    grants,
    dateExpires,
    dateGranted : latestDate(grants.map((grant) => grant.dateGranted)) ?? session.createdAt,
    grantee     : grants[0]?.grantee ?? 'unknown',
    active      : expiryTime > nowMs,
  };
}

function appendStandaloneGrant(
  groups: Map<string, PermissionGrant[]>,
  grant: PermissionGrant,
): void {
  const grantee = grant.grantee || 'unknown';
  const grants = groups.get(grantee) ?? [];
  grants.push(grant);
  groups.set(grantee, grants);
}

function sortSessions(groups: PermissionSessionGroup[]): PermissionSessionGroup[] {
  return [...groups].sort((left, right) => {
    const leftTime = timestamp(left.dateGranted) ?? 0;
    const rightTime = timestamp(right.dateGranted) ?? 0;
    return rightTime - leftTime;
  });
}

export function buildPermissionSections(
  permissions: PermissionGrant[] | undefined,
  now: Date = new Date(),
): PermissionSections {
  const sessionGroups = new Map<string, {
    session: ConnectSessionMetadata;
    grants: PermissionGrant[];
  }>();
  const standaloneGroups = new Map<string, PermissionGrant[]>();

  for (const grant of permissions ?? []) {
    const session = getConnectSession(grant);
    if (!session) {
      appendStandaloneGrant(standaloneGroups, grant);
      continue;
    }

    const existing = sessionGroups.get(session.id);
    if (existing) {
      existing.grants.push(grant);
    } else {
      sessionGroups.set(session.id, { session, grants: [grant] });
    }
  }

  const activeSessions: PermissionSessionGroup[] = [];
  const inactiveSessions: PermissionSessionGroup[] = [];
  const nowMs = now.getTime();

  for (const [id, group] of sessionGroups) {
    const sessionGroup = toSessionGroup(id, group.session, group.grants, nowMs);
    if (sessionGroup.active) {
      activeSessions.push(sessionGroup);
    } else {
      inactiveSessions.push(sessionGroup);
    }
  }

  return {
    activeSessions   : sortSessions(activeSessions),
    inactiveSessions : sortSessions(inactiveSessions),
    standaloneGroups : [...standaloneGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([grantee, grants]) => ({ grantee, grants })),
  };
}
