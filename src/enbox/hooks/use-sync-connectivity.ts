import type { SyncConnectivityState, SyncEvent } from '@enbox/agent';

import { useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/auth-store';

/**
 * Tracks the sync engine's aggregate connectivity to the DWN, which is distinct
 * from browser network status (the browser can be online while the sync server
 * is unreachable). Returns 'unknown' until an unlocked agent is available.
 * Mirrors the subscription pattern in {@link useSyncQueryInvalidation}.
 */
export function useSyncConnectivity(): SyncConnectivityState {
  const agent = useAuthStore((state) => state.agent);
  const [connectivity, setConnectivity] = useState<SyncConnectivityState>('unknown');

  useEffect(() => {
    if (!agent) {
      setConnectivity('unknown');
      return;
    }

    setConnectivity(agent.sync.connectivityState);

    return agent.sync.on((event: SyncEvent) => {
      if (event.type === 'link:connectivity-change') {
        setConnectivity(agent.sync.connectivityState);
      }
    });
  }, [agent]);

  return connectivity;
}
