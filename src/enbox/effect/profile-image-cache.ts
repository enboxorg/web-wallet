import type { MaterializedRecord } from '@enbox/api';
import type { BlobUrlLease } from '@enbox/browser';

import { createBlobUrlPool } from '@enbox/browser';
import { Context, Effect, Layer } from 'effect';

export type ProfileImageSlot = 'avatar' | 'hero';

type CachedProfileImageUrl = {
  key: string;
  lease: BlobUrlLease;
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

function makeProfileImageCacheService(): ProfileImageCacheService {
  const pool = createBlobUrlPool();
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

    previous?.lease.releaseAfter(BLOB_URL_REVOKE_DELAY_MS);
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
      previous.lease.releaseAfter(BLOB_URL_REVOKE_DELAY_MS);
    });
  }

  function clearDid(did: string): Effect.Effect<void> {
    return Effect.sync(() => {
      const cache = urls.get(did);
      if (!cache) {
        return;
      }

      urls.delete(did);
      cache.avatar?.lease.releaseAfter(BLOB_URL_REVOKE_DELAY_MS);
      cache.hero?.lease.releaseAfter(BLOB_URL_REVOKE_DELAY_MS);
    });
  }

  const clearAll = Effect.sync(() => {
    urls.clear();
    pool.dispose();
  });

  return {
    getOrCreate: (did, slot, image) => {
      const key = imageRecordCacheKey(image.record);
      const cached = urls.get(did)?.[slot];

      if (key && cached?.key === key) {
        return Effect.succeed(cached.lease.url);
      }

      return Effect.sync(() => {
        const lease = pool.acquire(image.value);
        setCachedImageUrl(did, slot, { key, lease });
        return lease.url;
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
