import { Effect } from 'effect';
import { Enbox } from '@enbox/api';
import { ProfileDefinition } from '@enbox/protocols';

import { sdkError } from '@/enbox/effect/errors';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import type { IdentityProfile } from '@/enbox/types';

/** Lazily-created anonymous Enbox instance for reading public DWN data. */
let _anonApi: ReturnType<typeof Enbox.anonymous> | undefined;

function getAnonymousApiEffect() {
  return Effect.sync(() => {
    if (!_anonApi) _anonApi = Enbox.anonymous();
    return _anonApi;
  });
}

function fetchOptionalImageUrlEffect(
  did: string,
  protocolPath: 'profile/avatar' | 'profile/hero',
) {
  return Effect.gen(function* () {
    const { dwn } = yield* getAnonymousApiEffect();
    const { records } = yield* Effect.tryPromise({
      try: async () =>
        dwn.records.query({
          from: did,
          filter: {
            protocol: ProfileDefinition.protocol,
            protocolPath,
          },
        }),
      catch: sdkError(`publicProfile.${protocolPath}.query`),
    });

    if (records.length === 0) {
      return undefined;
    }

    const blob = yield* Effect.tryPromise({
      try: async (): Promise<Blob> => records[0].data.blob(),
      catch: sdkError(`publicProfile.${protocolPath}.blob`),
    });

    return URL.createObjectURL(blob);
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
}

/** Fetch a public profile via anonymous DWN reads. */
export function fetchPublicProfileEffect(did: string) {
  return Effect.gen(function* () {
    const { dwn } = yield* getAnonymousApiEffect();

    let displayName = '';
    let tagline: string | undefined;
    let bio: string | undefined;

    const { records: profileRecords } = yield* Effect.tryPromise({
      try: async () =>
        dwn.records.query({
          from: did,
          filter: {
            protocol: ProfileDefinition.protocol,
            protocolPath: 'profile',
          },
        }),
      catch: sdkError('publicProfile.profile.query'),
    });

    if (profileRecords.length > 0) {
      const social = yield* Effect.tryPromise({
        try: async () =>
          profileRecords[0].data.json() as Promise<Record<string, string | undefined>>,
        catch: sdkError('publicProfile.profile.json'),
      });
      displayName = social.displayName ?? '';
      tagline = social.tagline;
      bio = social.bio;
    }

    const avatarUrl = yield* fetchOptionalImageUrlEffect(did, 'profile/avatar');
    const heroUrl = yield* fetchOptionalImageUrlEffect(did, 'profile/hero');

    return {
      did,
      displayName,
      tagline,
      bio,
      avatarUrl,
      heroUrl,
    } satisfies IdentityProfile;
  });
}

export function fetchPublicProfile(did: string): Promise<IdentityProfile> {
  return runEnboxPromise(fetchPublicProfileEffect(did));
}

export function resetPublicProfileClientForTests(): void {
  _anonApi = undefined;
}
