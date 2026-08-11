import type { ProfileReader } from '@enbox/protocols';

import { Effect } from 'effect';
import { Enbox } from '@enbox/api';
import { createProfileReader } from '@enbox/protocols';

import { sdkError } from '@/enbox/effect/errors';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import type { IdentityProfile } from '@/enbox/types';

export type PublicIdentityProfile = Omit<IdentityProfile, 'avatarUrl' | 'heroUrl'> & {
  avatar?: Blob;
  hero?: Blob;
};

/** Lazily-created reader so repeated lookups share its bounded retry/cache layer. */
let _profileReader: ProfileReader | undefined;

function getProfileReaderEffect() {
  return Effect.sync(() => {
    if (!_profileReader) {
      _profileReader = createProfileReader(Enbox.anonymous());
    }
    return _profileReader;
  });
}

/** Fetch a public profile via anonymous DWN reads. */
export function fetchPublicProfileEffect(did: string) {
  return Effect.gen(function* () {
    const reader = yield* getProfileReaderEffect();
    const { profile, images } = yield* Effect.tryPromise({
      try: async () => ({
        profile: await reader.get(did),
        images: await reader.loadImages(did),
      }),
      catch: sdkError('publicProfile.read'),
    });

    return {
      did         : profile.did,
      displayName : profile.displayName ?? '',
      tagline     : profile.tagline,
      bio         : profile.bio,
      avatar      : images.avatar,
      hero        : images.hero,
    } satisfies PublicIdentityProfile;
  });
}

export function fetchPublicProfile(did: string): Promise<PublicIdentityProfile> {
  return runEnboxPromise(fetchPublicProfileEffect(did));
}

export function resetPublicProfileClientForTests(): void {
  _profileReader?.dispose();
  _profileReader = undefined;
}
