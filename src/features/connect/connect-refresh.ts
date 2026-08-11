import type { DwnPermissionGrant } from '@enbox/agent';

import {
  buildPermissionSections,
  type PermissionSessionGroup,
} from '@/features/identities/tabs/permission-sessions';

import { getConnectRequestType } from './connect-request-type';

export const CONNECT_REFRESH_MAX_EXPIRING_SOON_SECONDS = 60 * 60;
export const CONNECT_REFRESH_EXPIRING_SOON_LIFETIME_RATIO = 0.1;

export type ConnectRefreshSessionStatus = 'active' | 'expiring-soon' | 'expired' | 'revoked' | 'none';
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

function getDelegateDid(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const delegateDid = (request as { delegateDid?: unknown }).delegateDid;
  return typeof delegateDid === 'string' ? delegateDid : undefined;
}

function getExpectedProviderDid(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const expectedProviderDid = (request as { expectedProviderDid?: unknown }).expectedProviderDid;
  return typeof expectedProviderDid === 'string' ? expectedProviderDid : undefined;
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
  request: unknown,
  ownerPermissions: OwnerPermissionGrants[],
  now: Date = new Date(),
  expiringSoonThresholdSeconds?: number,
): ConnectRefreshDetection {
  if (getConnectRequestType(request) !== 'refresh') {
    return {
      isRefresh : false,
      matchState: 'not-applicable',
      status    : 'none',
    };
  }

  const delegateDid = getDelegateDid(request);
  const expectedProviderDid = getExpectedProviderDid(request);
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
  const isRevoked = latestBundle.grants.some((grant) => revokedGrantIds.has(grant.id));

  return {
    isRefresh     : true,
    matchState    : 'matched',
    status        : isRevoked
      ? 'revoked'
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
