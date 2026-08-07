/**
 * TypeScript types used across the Enbox integration layer.
 *
 * Shared types for the wallet's Enbox integration.
 */

import type { EnboxPlatformAgent } from '@enbox/agent';

export type EnboxAgent = EnboxPlatformAgent;

/** A resolved identity profile (read model). */
export interface IdentityProfile {
  did: string;
  displayName: string;
  tagline?: string;
  bio?: string;
  avatarUrl?: string;
  heroUrl?: string;
  hasProfileRecord?: boolean;
}

/** Shape of a persisted registration token for a single DWN endpoint. */
export interface RegistrationTokenData {
  registrationToken: string;
  refreshToken?: string;
  /** Unix timestamp (ms); undefined = never expires. */
  expiresAt?: number;
  tokenUrl: string;
  refreshUrl?: string;
}
