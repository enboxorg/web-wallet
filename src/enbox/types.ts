/**
 * TypeScript types used across the Enbox integration layer.
 *
 * Shared types for the wallet's Enbox integration.
 */

import type { EnboxPlatformAgent } from '@enbox/agent';

export type { RegistrationTokenData } from '@enbox/browser';

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

export type IdentityProfileImage = Readonly<{
  blob: Blob;
  key: string;
}>;

/** Profile query data before browser object-URL materialization. */
export type IdentityProfileData = Omit<IdentityProfile, 'avatarUrl' | 'heroUrl'> & {
  avatar?: IdentityProfileImage;
  hero?: IdentityProfileImage;
};
