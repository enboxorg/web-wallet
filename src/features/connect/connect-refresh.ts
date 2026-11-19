import type { DwnPermissionGrant } from '@enbox/agent';
import type { ConnectPermissionRequest, ConnectRequest } from '@enbox/connect';

import {
  buildPermissionSections,
  type PermissionSessionGroup,
} from '@/features/identities/tabs/permission-sessions';
import { formatList } from '@/components/connect/connect-scope-display';
import { nameForRequestedModule } from '@/lib/module-names';

export const CONNECT_REFRESH_MAX_EXPIRING_SOON_SECONDS = 60 * 60;
export const CONNECT_REFRESH_EXPIRING_SOON_LIFETIME_RATIO = 0.1;

export type ConnectRefreshSessionStatus =
  | 'active'
  | 'expiring-soon'
  | 'expired'
  | 'permissions-changed'
  | 'revoked'
  | 'none';
export type ConnectRefreshMatchState =
  | 'not-applicable'
  | 'matched'
  | 'not-found'
  | 'ambiguous'
  | 'profile-mismatch';

export interface OwnerPermissionGrants {
  ownerDid: string;
  permissions: DwnPermissionGrant[];
  revokedGrantIds: string[];
}

export interface ConnectRefreshDetection {
  isRefresh: boolean;
  matchState: ConnectRefreshMatchState;
  status: ConnectRefreshSessionStatus;
  matchedSession?: PermissionSessionGroup;
  pinnedOwnerDid?: string;
  expiresAt?: string;
}

function timestamp(value: string | undefined): number {
  if (value === undefined) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getSessionStatus(
  expiresAt: string,
  createdAt: string,
  now: Date,
  expiringSoonThresholdSeconds: number | undefined,
): ConnectRefreshSessionStatus {
  const expiresAtMs = timestamp(expiresAt);
  const createdAtMs = timestamp(createdAt);
  const secondsUntilExpiry = (expiresAtMs - now.getTime()) / 1000;
  const effectiveThreshold = expiringSoonThresholdSeconds ?? Math.min(
    CONNECT_REFRESH_MAX_EXPIRING_SOON_SECONDS,
    Math.max(
      0,
      (expiresAtMs - createdAtMs) / 1000 * CONNECT_REFRESH_EXPIRING_SOON_LIFETIME_RATIO,
    ),
  );
  if (secondsUntilExpiry <= 0) return 'expired';
  if (secondsUntilExpiry <= effectiveThreshold) return 'expiring-soon';
  return 'active';
}

/**
 * Finds the previous connect session for a refresh request.
 *
 * Only an exact delegate-grantee match may identify the owner. Request app
 * names and relay origins are self-reported display hints and are never used
 * to select an identity.
 */
export function detectConnectRefresh(
  request: Partial<ConnectRequest> | undefined,
  ownerPermissions: OwnerPermissionGrants[],
  now: Date = new Date(),
  expiringSoonThresholdSeconds?: number,
): ConnectRefreshDetection {
  if (request?.requestType !== 'refresh') {
    return {
      isRefresh : false,
      matchState: 'not-applicable',
      status    : 'none',
    };
  }

  const { delegateDid, expectedProviderDid } = request;
  if (delegateDid === undefined) {
    return {
      isRefresh : true,
      matchState: 'not-found',
      status    : 'none',
    };
  }

  const candidates: Array<{
    ownerDid: string;
    session: PermissionSessionGroup;
  }> = [];

  for (const owner of ownerPermissions) {
    const sections = buildPermissionSections(owner.permissions, now);
    const sessions = [...sections.activeSessions, ...sections.inactiveSessions];

    for (const session of sessions) {
      const belongsToOwner = session.grants.length > 0
        && session.grants.every((grant) => grant.grantor === owner.ownerDid);
      if (belongsToOwner && session.grantee === delegateDid) {
        candidates.push({ ownerDid: owner.ownerDid, session });
      }
    }
  }

  if (candidates.length === 0) {
    return {
      isRefresh : true,
      matchState: 'not-found',
      status    : 'none',
    };
  }

  const matchingCandidates = expectedProviderDid === undefined
    ? candidates
    : candidates.filter((candidate) => candidate.ownerDid === expectedProviderDid);
  if (expectedProviderDid !== undefined && matchingCandidates.length === 0) {
    return {
      isRefresh : true,
      matchState: 'profile-mismatch',
      status    : 'none',
    };
  }

  const owners = new Set(matchingCandidates.map((candidate) => candidate.ownerDid));
  if (owners.size !== 1) {
    return {
      isRefresh : true,
      matchState: 'ambiguous',
      status    : 'none',
    };
  }

  const latest = [...matchingCandidates].sort((left, right) =>
    timestamp(right.session.session.createdAt) - timestamp(left.session.session.createdAt)
  )[0];
  const latestBundle = latest.session.bundles[0];
  const expiresAt = latestBundle.dateExpires;
  const owner = ownerPermissions.find(({ ownerDid }) => ownerDid === latest.ownerDid);
  const revokedGrantIds = new Set(owner?.revokedGrantIds ?? []);
  const revokedGrantCount = latestBundle.grants.filter((grant) => revokedGrantIds.has(grant.id)).length;
  const isFullyRevoked = revokedGrantCount > 0 && revokedGrantCount === latestBundle.grants.length;
  const hasChangedPermissions = revokedGrantCount > 0 && !isFullyRevoked;

  return {
    isRefresh     : true,
    matchState    : 'matched',
    status        : isFullyRevoked
      ? 'revoked'
      : hasChangedPermissions
        ? 'permissions-changed'
        : getSessionStatus(
          expiresAt,
          latestBundle.session.createdAt,
          now,
          expiringSoonThresholdSeconds,
        ),
    matchedSession: latest.session,
    pinnedOwnerDid: latest.ownerDid,
    expiresAt,
  };
}

type ScopeShape = {
  interface: string;
  method: string;
  module?: string;
  modulePath?: string;
  contextId?: string;
};

/**
 * Whether an earlier grant covered a requested scope. Path- and
 * context-limited grants only cover the identical path or context; anything
 * uncertain counts as not covered, so it is shown as new access.
 */
function grantCovers(granted: ScopeShape, requested: ScopeShape): boolean {
  if (granted.interface !== requested.interface || granted.method !== requested.method) return false;
  if (granted.module !== undefined && granted.module !== requested.module) return false;
  if (granted.modulePath !== undefined && granted.modulePath !== requested.modulePath) return false;
  if (granted.contextId !== undefined && granted.contextId !== requested.contextId) return false;
  return true;
}

export interface RefreshAccessSplit {
  /** Scopes this delegate never held, grouped by module: new access. */
  added: ConnectPermissionRequest[];
  /** Scopes it held before, whether active, expiring, expired or revoked. */
  renewed: ConnectPermissionRequest[];
}

/**
 * Split a refresh request by what the delegate actually held before. The
 * request's own claim to be a refresh says nothing about its contents, so
 * anything never granted to this delegate is new access, not a renewal.
 */
export function splitRefreshAccess(
  requests: readonly ConnectPermissionRequest[],
  previousGrants: readonly DwnPermissionGrant[],
): RefreshAccessSplit {
  const previousScopes = previousGrants.map((grant) => grant.scope as ScopeShape);
  const added: ConnectPermissionRequest[] = [];
  const renewed: ConnectPermissionRequest[] = [];

  for (const request of requests) {
    const scopes = request.permissionScopes as ScopeShape[];
    const held = scopes.filter((scope) => previousScopes.some((granted) => grantCovers(granted, scope)));
    const fresh = scopes.filter((scope) => !held.includes(scope));

    if (fresh.length > 0) {
      added.push({ ...request, permissionScopes: fresh as ConnectPermissionRequest['permissionScopes'] });
    }
    // Setup-only entries (no scopes) stay with the renewal: they grant nothing.
    if (held.length > 0 || scopes.length === 0) {
      renewed.push({ ...request, permissionScopes: held as ConnectPermissionRequest['permissionScopes'] });
    }
  }

  return { added, renewed };
}

/** Whether a split asks for anything the delegate never held. */
export function refreshAddsAccess(split: RefreshAccessSplit | undefined): boolean {
  return (split?.added.length ?? 0) > 0;
}

/**
 * The requester line for a refresh, from what the wallet found rather than
 * what the request claims: "wants to add Bills and Budgets" when anything is
 * new, otherwise "wants to renew its access to your profile".
 */
export function refreshRequestSummary(split: RefreshAccessSplit | undefined): string {
  if (!split || !refreshAddsAccess(split)) return 'wants to renew its access to your profile';
  const names = [...new Set(split.added.map((request) => nameForRequestedModule(request.moduleDefinition)))];
  const listed = names.length > 3
    ? formatList([...names.slice(0, 2), `${names.length - 2} more`])
    : formatList(names);
  const renews = split.renewed.some((request) => request.permissionScopes.length > 0);
  return `wants to add ${listed}${renews ? ' and renew its existing access' : ''}`;
}
