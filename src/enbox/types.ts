/**
 * TypeScript types used across the Enbox integration layer.
 *
 * Shared types for the wallet's Enbox integration.
 */

import type { EnboxPlatformAgent } from '@enbox/agent';

export type { RegistrationTokenData } from '@enbox/auth';

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
