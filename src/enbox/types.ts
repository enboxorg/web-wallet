/**
 * TypeScript types used across the Enbox integration layer.
 *
 * We use `any` for heavy SDK types to avoid deep imports that would couple
 * consumers to the exact SDK version and slow down type-checking.
 */

// Re-export SDK types as opaque aliases for convenience.
 
export type EnboxAgent = any; // Actually EnboxUserAgent from @enbox/agent

/** A resolved identity profile (read model). */
export interface IdentityProfile {
  did: string;
  displayName: string;
  tagline?: string;
  bio?: string;
  avatarUrl?: string;
  heroUrl?: string;
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
