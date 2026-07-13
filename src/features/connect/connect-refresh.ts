import type { PermissionGrant } from '@enbox/api';

import {
  buildPermissionSections,
  type PermissionSessionGroup,
} from '@/features/identities/tabs/permission-sessions';

import { getConnectRequestType } from './connect-request-type';

export const CONNECT_REFRESH_EXPIRING_SOON_SECONDS = 60 * 60;

export type ConnectRefreshSessionStatus = 'active' | 'expiring-soon' | 'expired' | 'none';
export type ConnectRefreshMatchState = 'not-applicable' | 'matched' | 'not-found' | 'ambiguous';

export interface OwnerPermissionGrants {
  ownerDid: string;
  permissions: PermissionGrant[];
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

function timestamp(value: string | undefined): number {
  if (value === undefined) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getSessionStatus(
  expiresAt: string,
  now: Date,
  expiringSoonThresholdSeconds: number,
): ConnectRefreshSessionStatus {
  const secondsUntilExpiry = (timestamp(expiresAt) - now.getTime()) / 1000;
  if (secondsUntilExpiry <= 0) return 'expired';
  if (secondsUntilExpiry <= expiringSoonThresholdSeconds) return 'expiring-soon';
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
  expiringSoonThresholdSeconds = CONNECT_REFRESH_EXPIRING_SOON_SECONDS,
): ConnectRefreshDetection {
  if (getConnectRequestType(request) !== 'refresh') {
    return {
      isRefresh : false,
      matchState: 'not-applicable',
      status    : 'none',
    };
  }

  const delegateDid = getDelegateDid(request);
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

  const owners = new Set(candidates.map((candidate) => candidate.ownerDid));
  if (owners.size !== 1) {
    return {
      isRefresh : true,
      matchState: 'ambiguous',
      status    : 'none',
    };
  }

  const latest = [...candidates].sort((left, right) =>
    timestamp(right.session.session.createdAt) - timestamp(left.session.session.createdAt)
  )[0];
  const expiresAt = latest.session.dateExpires;

  return {
    isRefresh     : true,
    matchState    : 'matched',
    status        : getSessionStatus(expiresAt, now, expiringSoonThresholdSeconds),
    matchedSession: latest.session,
    pinnedOwnerDid: latest.ownerDid,
    expiresAt,
  };
}
