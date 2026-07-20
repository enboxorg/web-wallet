import type { SyncEvent } from '@enbox/agent';

import { useEffect } from 'react';

import { useAuthStore } from '@/stores/auth-store';

import {
  isRepairableRegistrationFailure,
  repairRegistrationFromSyncEvent,
} from '../registration-repair';

/** Listen for definitive remote registration failures while the wallet is unlocked. */
export function useRegistrationRepair(): void {
  const agent = useAuthStore((state) => state.agent);

  useEffect(() => {
    if (!agent) {
      return;
    }

    return agent.sync.on((event: SyncEvent): void => {
      if (event.type !== 'repair:failed' || !isRepairableRegistrationFailure(event.error)) {
        return;
      }
      void repairRegistrationFromSyncEvent(agent, event).catch((error: unknown) => {
        console.error(
          `DWN registration repair failed for ${event.tenantDid} -> ${event.remoteEndpoint}:`,
          error,
        );
      });
    });
  }, [agent]);
}
