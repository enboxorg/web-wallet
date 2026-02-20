import type { ProfileData as BaseProfileData } from '@enbox/protocols';

export interface Identity {
  persona: string;
  didUri: string;
  profile: IdentityProfileData;
}

/**
 * Extends the protocol's ProfileData with a wallet-specific `apps` field
 * for tracking connected applications.
 */
export type SocialData = BaseProfileData & {
  apps: Record<string, string>;
}

export type IdentityProfileData = {
  social?: SocialData;
  avatar?: Blob;
  avatarUrl?: string;
  hero?: Blob;
  heroUrl?: string;
}
