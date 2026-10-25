import { Enbox } from '@enbox/browser';
import { useProfile } from '@enbox/react';
import { useMemo } from 'react';

/** Read public profiles with SDK-owned watches and image URL leases. */
export function usePublicProfile(did: string, enabled: boolean) {
  const source = useMemo(() => enabled ? Enbox.anonymous() : undefined, [enabled]);
  return useProfile(source, did, { enabled });
}
