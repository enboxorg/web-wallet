import type { SyncConnectivityState, SyncEvent } from '@enbox/agent';

import { useCallback, useSyncExternalStore } from 'react';

import { useAuthStore } from '@/stores/auth-store';

/**
 * Tracks the sync engine's aggregate connectivity to the DWN, which is distinct
 * from browser network status (the browser can be online while the sync server
 * is unreachable). Returns 'unknown' until an unlocked agent is available.
 * Mirrors the subscription pattern in {@link useSyncQueryInvalidation}.
 */
export function useSyncConnectivity(): SyncConnectivityState {
  const agent = useAuthStore((state) => state.agent);
  const subscribe = useCallback((listener: () => void): (() => void) => {
    return agent?.sync.on((event: SyncEvent): void => {
      if (event.type === 'link:connectivity-change') {
        listener();
      }
    }) ?? (() => {});
  }, [agent]);
  const getSnapshot = useCallback(
    (): SyncConnectivityState => agent?.sync.connectivityState ?? 'unknown',
    [agent],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
