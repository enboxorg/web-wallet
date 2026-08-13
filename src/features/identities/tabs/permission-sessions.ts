import type { ConnectSessionMetadata, DwnPermissionGrant } from '@enbox/agent';

/**
 * The connect approval ceremony stores one contextId-scoped revocation grant
 * per session grant so the delegate can self-revoke its own access. They are
 * protocol machinery — deliberately stamped without `connectSession` display
 * metadata — and are never user-facing, so permission display and grouping
 * must exclude them rather than bucket them as session-less grants.
 */
const PERMISSIONS_PROTOCOL_URI = 'https://identity.foundation/dwn/permissions';

export function isSessionRevocationGrant(grant: DwnPermissionGrant): boolean {
  const scope = grant.scope as { protocol?: string; contextId?: unknown } | undefined;
  return scope?.protocol === PERMISSIONS_PROTOCOL_URI
    && typeof scope.contextId === 'string';
}

export interface PermissionApprovalBundle {
  id: string;
  session: ConnectSessionMetadata;
  grantee: string;
  grants: DwnPermissionGrant[];
  dateGranted?: string;
  dateExpires: string;
  active: boolean;
}

export interface PermissionSessionGroup {
  /** Stable device/session identity: the delegate DID. */
  id: string;
  /** Metadata from the most recent approval bundle. */
  session: ConnectSessionMetadata;
  grantee: string;
  bundles: PermissionApprovalBundle[];
  grants: DwnPermissionGrant[];
  dateGranted?: string;
  lastRenewed?: string;
  dateExpires: string;
  active: boolean;
}

export interface PermissionApplicationGroup {
  id: string;
  applicationId?: string;
  name: string;
  origin?: string;
  identityTrust: 'verified-origin' | 'reported';
  sessions: PermissionSessionGroup[];
  activeSessionCount: number;
  permissionCount: number;
}

type PermissionApplicationIdentityTrust = PermissionApplicationGroup['identityTrust'];

export interface PermissionGranteeGroup {
  grantee: string;
  grants: DwnPermissionGrant[];
}

export interface PermissionSections {
  applications: PermissionApplicationGroup[];
  activeSessions: PermissionSessionGroup[];
  inactiveSessions: PermissionSessionGroup[];
  standaloneGroups: PermissionGranteeGroup[];
}

type ConnectSessionWithApplicationId = ConnectSessionMetadata & {
  applicationId?: unknown;
};

function getConnectSession(grant: DwnPermissionGrant): ConnectSessionMetadata | undefined {
  const session = grant.connectSession;
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

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getApplicationId(session: ConnectSessionMetadata): string | undefined {
  return nonEmptyString((session as ConnectSessionWithApplicationId).applicationId);
}

function normalizeOrigin(value: string | undefined): string | undefined {
  const origin = nonEmptyString(value);
  if (!origin) return undefined;

  try {
    const parsed = new URL(origin);
    if (parsed.origin !== 'null') {
      return parsed.origin;
    }
  } catch {
    // Native clients can provide non-URL origin identifiers. They remain
    // useful display hints after conservative normalization.
  }

  return origin.replace(/\/+$/, '').toLowerCase();
}

function isWebOrigin(value: string | undefined): boolean {
  if (value === undefined) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
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

function toApprovalBundle(
  session: ConnectSessionMetadata,
  grants: DwnPermissionGrant[],
  nowMs: number,
): PermissionApprovalBundle {
  const dateExpires = earliestDate(grants.map((grant) => grant.dateExpires))
    ?? session.expiresAt;

  return {
    id          : session.id,
    session,
    grants,
    dateExpires,
    dateGranted : session.createdAt,
    grantee     : grants[0]?.grantee ?? 'unknown',
    active      : grants.some((grant) => (timestamp(grant.dateExpires) ?? 0) > nowMs),
  };
}

function appendStandaloneGrant(
  groups: Map<string, DwnPermissionGrant[]>,
  grant: DwnPermissionGrant,
): void {
  const grantee = grant.grantee || 'unknown';
  const grants = groups.get(grantee) ?? [];
  grants.push(grant);
  groups.set(grantee, grants);
}

function sortApprovalBundles(
  bundles: PermissionApprovalBundle[],
): PermissionApprovalBundle[] {
  return [...bundles].sort((left, right) => {
    const leftTime = timestamp(left.dateGranted) ?? 0;
    const rightTime = timestamp(right.dateGranted) ?? 0;
    return rightTime - leftTime;
  });
}

function toSessionGroup(
  grantee: string,
  bundles: PermissionApprovalBundle[],
  nowMs: number,
): PermissionSessionGroup {
  const sortedBundles = sortApprovalBundles(bundles);
  const newestBundle = sortedBundles[0];
  const grants = sortedBundles.flatMap((bundle) => bundle.grants);
  const dateGranted = earliestDate(sortedBundles.map((bundle) => bundle.dateGranted));
  const lastRenewed = latestDate(sortedBundles.map((bundle) => bundle.dateGranted));
  const dateExpires = latestDate(grants.map((grant) => grant.dateExpires))
    ?? newestBundle.dateExpires;

  return {
    id      : grantee,
    session : newestBundle.session,
    grantee,
    bundles : sortedBundles,
    grants,
    dateGranted,
    lastRenewed,
    dateExpires,
    active  : grants.some((grant) => (timestamp(grant.dateExpires) ?? 0) > nowMs),
  };
}

function sortSessions(groups: PermissionSessionGroup[]): PermissionSessionGroup[] {
  return [...groups].sort((left, right) => {
    const leftTime = timestamp(left.lastRenewed) ?? 0;
    const rightTime = timestamp(right.lastRenewed) ?? 0;
    return rightTime - leftTime;
  });
}

function applicationGroupingKey(bundle: PermissionApprovalBundle): {
  key: string;
  applicationId?: string;
  origin?: string;
  identityTrust: PermissionApplicationIdentityTrust;
} {
  const applicationId = getApplicationId(bundle.session);
  const origin = normalizeOrigin(bundle.session.origin);
  const identityTrust = bundle.session.transport === 'postMessage'
    && origin !== undefined
    && isWebOrigin(origin)
    ? 'verified-origin'
    : 'reported';

  // A web app's canonical origin is its stable identity. Keeping this key
  // independent of the optional application ID also groups grants created
  // before that field existed with newer sessions from the same website.
  // The trust source is part of the identity: relay metadata is app-reported
  // and must never merge into a transport-authenticated popup origin.
  if (origin && isWebOrigin(origin)) {
    return {
      key: `${identityTrust}:origin:${origin}`,
      applicationId,
      origin,
      identityTrust,
    };
  }

  if (applicationId) {
    return {
      key: origin
        ? `${identityTrust}:application:${origin}\u0000${applicationId}`
        : `${identityTrust}:application:${applicationId}`,
      applicationId,
      origin,
      identityTrust,
    };
  }

  if (origin) {
    return { key: `${identityTrust}:origin:${origin}`, origin, identityTrust };
  }

  // Without an app identifier, renewals for one delegate can still be shown
  // as one stable session. Different delegates remain isolated because a
  // self-reported display name alone is not an application identity.
  return { key: `${identityTrust}:legacy:${bundle.grantee}`, identityTrust };
}

function buildApplicationGroups(
  bundles: PermissionApprovalBundle[],
  nowMs: number,
): PermissionApplicationGroup[] {
  const grouped = new Map<string, {
    origin?: string;
    identityTrust: PermissionApplicationIdentityTrust;
    bundles: PermissionApprovalBundle[];
  }>();

  for (const bundle of bundles) {
    const identity = applicationGroupingKey(bundle);
    const existing = grouped.get(identity.key);
    if (existing) {
      existing.bundles.push(bundle);
    } else {
      grouped.set(identity.key, {
        origin        : identity.origin,
        identityTrust : identity.identityTrust,
        bundles       : [bundle],
      });
    }
  }

  return [...grouped.entries()]
    .map(([id, group]) => {
      const sortedBundles = sortApprovalBundles(group.bundles);
      const representative = sortedBundles[0];
      const applicationId = getApplicationId(representative.session);
      const name = nonEmptyString(representative.session.appName)
        ?? applicationId
        ?? group.origin
        ?? 'Unknown app';
      const byGrantee = new Map<string, PermissionApprovalBundle[]>();

      for (const bundle of sortedBundles) {
        const sessionBundles = byGrantee.get(bundle.grantee) ?? [];
        sessionBundles.push(bundle);
        byGrantee.set(bundle.grantee, sessionBundles);
      }

      const sessions = sortSessions([...byGrantee.entries()].map(([grantee, sessionBundles]) =>
        toSessionGroup(grantee, sessionBundles, nowMs)
      ));

      return {
        id,
        name,
        applicationId,
        origin             : group.origin,
        identityTrust      : group.identityTrust,
        sessions,
        activeSessionCount : sessions.filter((session) => session.active).length,
        permissionCount    : sessions.reduce(
          (count, session) => count + session.grants.length,
          0,
        ),
      };
    })
    .sort((left, right) => {
      const activeDifference = Number(right.activeSessionCount > 0)
        - Number(left.activeSessionCount > 0);
      if (activeDifference !== 0) return activeDifference;

      const leftTime = timestamp(left.sessions[0]?.lastRenewed) ?? 0;
      const rightTime = timestamp(right.sessions[0]?.lastRenewed) ?? 0;
      if (leftTime !== rightTime) return rightTime - leftTime;

      return left.name.localeCompare(right.name);
    });
}

export function buildPermissionSections(
  permissions: DwnPermissionGrant[] | undefined,
  now: Date = new Date(),
): PermissionSections {
  const bundleGroups = new Map<string, {
    session: ConnectSessionMetadata;
    grants: DwnPermissionGrant[];
  }>();
  const standaloneGroups = new Map<string, DwnPermissionGrant[]>();

  for (const grant of permissions ?? []) {
    if (isSessionRevocationGrant(grant)) {
      continue;
    }

    const session = getConnectSession(grant);
    if (!session) {
      appendStandaloneGrant(standaloneGroups, grant);
      continue;
    }

    const bundleKey = `${grant.grantee}\u0000${session.id}`;
    const existing = bundleGroups.get(bundleKey);
    if (existing) {
      existing.grants.push(grant);
    } else {
      bundleGroups.set(bundleKey, { session, grants: [grant] });
    }
  }

  const nowMs = now.getTime();
  const bundles = [...bundleGroups.values()].map(({ session, grants }) =>
    toApprovalBundle(session, grants, nowMs)
  );
  const applications = buildApplicationGroups(bundles, nowMs);
  const sessions = applications.flatMap((application) => application.sessions);

  return {
    applications,
    activeSessions   : sortSessions(sessions.filter((session) => session.active)),
    inactiveSessions : sortSessions(sessions.filter((session) => !session.active)),
    standaloneGroups : [...standaloneGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([grantee, grants]) => ({ grantee, grants })),
  };
}

/**
 * Count the entries that currently hold access: applications with at least
 * one active session, plus standalone grantee groups with at least one
 * unexpired grant. Apps whose sessions all expired no longer have access
 * and do not count.
 */
export function countActivePermissionApps(
  permissions: DwnPermissionGrant[] | undefined,
  now: Date = new Date(),
): number {
  const sections = buildPermissionSections(permissions, now);
  const nowMs = now.getTime();

  const activeApps = sections.applications.filter(
    (application) => application.activeSessionCount > 0,
  ).length;

  const activeStandalone = sections.standaloneGroups.filter((group) =>
    group.grants.some((grant) => {
      const expiry = timestamp(grant.dateExpires);
      return expiry === undefined || expiry > nowMs;
    })
  ).length;

  return activeApps + activeStandalone;
}
