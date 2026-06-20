import { useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/auth-store';

type SyncConnectivity = 'online' | 'offline' | 'unknown';

function normalizeConnectivity(value: unknown): SyncConnectivity {
  return value === 'online' || value === 'offline' ? value : 'unknown';
}

/**
 * Tracks the sync engine's aggregate connectivity to the DWN, which is distinct
 * from browser network status (the browser can be online while the sync server
 * is unreachable). Returns 'unknown' until an unlocked agent is available.
 * Mirrors the subscription pattern in {@link useSyncQueryInvalidation}.
 */
export function useSyncConnectivity(): SyncConnectivity {
  const agent = useAuthStore((state) => state.agent);
  const [connectivity, setConnectivity] = useState<SyncConnectivity>('unknown');

  useEffect(() => {
    if (!agent || typeof agent.sync?.on !== 'function') {
      setConnectivity('unknown');
      return;
    }

    setConnectivity(normalizeConnectivity(agent.sync.connectivityState));

    return agent.sync.on((event: any) => {
      if (event?.type === 'link:connectivity-change') {
        setConnectivity(normalizeConnectivity(agent.sync.connectivityState));
      }
    });
  }, [agent]);

  return connectivity;
}
