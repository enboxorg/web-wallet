/**
 * Hook for fetching the profile (social data, avatar, hero) of a DID.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { IdentityProfile, IdentityProfileData } from '../types';

import { useAgent } from './use-agent';
import { useBlobUrl } from './use-blob-url';
import { queryKeys } from '../queries/query-keys';
import { fetchProfile } from '../queries/identity-queries';

const PROFILE_IMAGE_URL_RELEASE_DELAY_MS = 60_000;

function preserveProfileImages(
  previous: unknown,
  next: unknown,
): unknown {
  const current = previous as IdentityProfileData | undefined;
  const profile = next as IdentityProfileData;
  return {
    ...profile,
    avatar : current?.avatar?.key === profile.avatar?.key ? current?.avatar : profile.avatar,
    hero   : current?.hero?.key === profile.hero?.key ? current?.hero : profile.hero,
  };
}

export function useProfile(did: string) {
  const agent = useAgent();

  const query = useQuery<IdentityProfileData>({
    queryKey         : queryKeys.identities.profile(did),
    queryFn          : () => fetchProfile(agent, did),
    enabled          : !!did,
    structuralSharing: preserveProfileImages,
  });
  const avatarUrl = useBlobUrl(
    query.data?.avatar?.blob,
    PROFILE_IMAGE_URL_RELEASE_DELAY_MS,
  );
  const heroUrl = useBlobUrl(
    query.data?.hero?.blob,
    PROFILE_IMAGE_URL_RELEASE_DELAY_MS,
  );
  const data = useMemo<IdentityProfile | undefined>(() => {
    const profile = query.data;
    if (profile === undefined) {
      return undefined;
    }

    return {
      did              : profile.did,
      displayName      : profile.displayName,
      tagline          : profile.tagline,
      bio              : profile.bio,
      avatarUrl,
      heroUrl,
      hasProfileRecord : profile.hasProfileRecord,
    };
  }, [query.data, avatarUrl, heroUrl]);

  return { ...query, data };
}
