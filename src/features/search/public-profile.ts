import type { ProfileReader, ProfileSnapshot, PublicProfile } from '@enbox/browser';

import { createProfileReader, Enbox } from '@enbox/browser';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

let _profileReader: ProfileReader | undefined;

function getProfileReader(): ProfileReader {
  _profileReader ??= createProfileReader(Enbox.anonymous(), { images: 'eager' });
  return _profileReader;
}

/** Bind one public profile directly to the reader's reference-stable snapshot. */
export function usePublicProfile(did: string, enabled: boolean) {
  const subscribe = useCallback((listener: () => void): (() => void) => {
    return enabled
      ? getProfileReader().watch([did], listener)
      : (): void => {};
  }, [did, enabled]);
  const getSnapshot = useCallback((): ProfileSnapshot | undefined => {
    return enabled ? getProfileReader().getSnapshot(did) : undefined;
  }, [did, enabled]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return useMemo(() => {
    const isError = snapshot?.status === 'error';
    const isLoading = enabled && (
      snapshot === undefined || snapshot.status === 'loading'
    );
    const failure = snapshot?.profile.failure;
    const data: PublicProfile | undefined = snapshot === undefined || isError || isLoading
      ? undefined
      : {
        did         : snapshot.did,
        displayName : snapshot.profile.value?.displayName ?? '',
        tagline     : snapshot.profile.value?.tagline,
        bio         : snapshot.profile.value?.bio,
        avatar      : snapshot.avatar.value,
        hero        : snapshot.hero.value,
      };

    return {
      data,
      error: failure === undefined
        ? undefined
        : new Error(failure.message, { cause: failure.cause }),
      isError,
      isLoading,
    };
  }, [enabled, snapshot]);
}

export function resetPublicProfileClientForTests(): void {
  _profileReader?.dispose();
  _profileReader = undefined;
}
