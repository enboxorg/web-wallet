import type { MaterializedRecord } from '@enbox/api';

import { Context, Effect, Layer } from 'effect';

import { sdkError } from './errors';

export type ProfileImageSlot = 'avatar' | 'hero';

type CachedProfileImageUrl = {
  key: string;
  url: string;
};

export interface ProfileImageCacheService {
  readonly getOrCreate: (
    did: string,
    slot: ProfileImageSlot,
    image: MaterializedRecord<Blob>,
  ) => Effect.Effect<string, unknown>;
  readonly clear: (did: string, slot: ProfileImageSlot) => Effect.Effect<void>;
  readonly clearDid: (did: string) => Effect.Effect<void>;
  readonly clearAll: Effect.Effect<void>;
}

export class ProfileImageCache extends Context.Tag('enbox/ProfileImageCache')<
  ProfileImageCache,
  ProfileImageCacheService
>() {}

const BLOB_URL_REVOKE_DELAY_MS = 60_000;

function imageRecordCacheKey(record: MaterializedRecord<Blob>['record']): string {
  return [record.id, record.dataCid, record.dataSize, record.timestamp]
    .filter((part): part is string | number =>
      typeof part === 'string' || typeof part === 'number'
    )
    .join('|');
}

function revokeObjectUrl(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Best-effort cleanup only.
  }
}

function revokeObjectUrlLater(url: string): void {
  setTimeout(() => revokeObjectUrl(url), BLOB_URL_REVOKE_DELAY_MS);
}

function makeProfileImageCacheService(): ProfileImageCacheService {
  const urls = new Map<string, Partial<Record<ProfileImageSlot, CachedProfileImageUrl>>>();

  function setCachedImageUrl(
    did: string,
    slot: ProfileImageSlot,
    next: CachedProfileImageUrl,
  ): void {
    const cache = urls.get(did) ?? {};
    const previous = cache[slot];

    cache[slot] = next;
    urls.set(did, cache);

    if (previous && previous.url !== next.url) {
      revokeObjectUrlLater(previous.url);
    }
  }

  function clear(did: string, slot: ProfileImageSlot): Effect.Effect<void> {
    return Effect.sync(() => {
      const cache = urls.get(did);
      const previous = cache?.[slot];

      if (!cache || !previous) {
        return;
      }

      delete cache[slot];
      if (!cache.avatar && !cache.hero) {
        urls.delete(did);
      }
      revokeObjectUrlLater(previous.url);
    });
  }

  function clearDid(did: string): Effect.Effect<void> {
    return Effect.sync(() => {
      const cache = urls.get(did);
      if (!cache) {
        return;
      }

      urls.delete(did);
      if (cache.avatar) revokeObjectUrlLater(cache.avatar.url);
      if (cache.hero) revokeObjectUrlLater(cache.hero.url);
    });
  }

  const clearAll = Effect.sync(() => {
    for (const cache of urls.values()) {
      if (cache.avatar) revokeObjectUrl(cache.avatar.url);
      if (cache.hero) revokeObjectUrl(cache.hero.url);
    }
    urls.clear();
  });

  return {
    getOrCreate: (did, slot, image) => {
      const key = imageRecordCacheKey(image.record);
      const cached = urls.get(did)?.[slot];

      if (key && cached?.key === key) {
        return Effect.succeed(cached.url);
      }

      return Effect.tryPromise({
        try: async () => {
          const url = URL.createObjectURL(image.value);
          setCachedImageUrl(did, slot, { key: key || url, url });
          return url;
        },
        catch: sdkError(`profile.${slot}.blob`),
      });
    },
    clear,
    clearDid,
    clearAll,
  };
}

export const ProfileImageCacheLive = Layer.scoped(
  ProfileImageCache,
  Effect.gen(function* () {
    const cache = makeProfileImageCacheService();
    yield* Effect.addFinalizer(() => cache.clearAll);
    return cache;
  }),
);

export function getCachedProfileImageUrlEffect(
  did: string,
  slot: ProfileImageSlot,
  image: MaterializedRecord<Blob>,
) {
  return Effect.flatMap(ProfileImageCache, (cache) =>
    cache.getOrCreate(did, slot, image)
  );
}

export function clearCachedProfileImageUrlEffect(
  did: string,
  slot: ProfileImageSlot,
) {
  return Effect.flatMap(ProfileImageCache, (cache) => cache.clear(did, slot));
}

export function clearCachedProfileImagesEffect(did: string) {
  return Effect.flatMap(ProfileImageCache, (cache) => cache.clearDid(did));
}
