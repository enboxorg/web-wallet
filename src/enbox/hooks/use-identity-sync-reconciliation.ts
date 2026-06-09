import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { useAuthStore } from '@/stores/auth-store';

import { getIdentityDid, reconcileIdentitySync } from '../identity-sync';
import { queryKeys } from '../queries/query-keys';

export function useIdentitySyncReconciliation(identities: unknown[] | undefined): void {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const latestRef = useRef({ agent, identities });
  latestRef.current = { agent, identities };

  const identityKey = useMemo(() => {
    if (!identities?.length) return '';
    return identities
      .map(getIdentityDid)
      .filter(Boolean)
      .sort()
      .join('|');
  }, [identities]);

  useEffect(() => {
    if (!agent || !identityKey) {
      return;
    }

    async function run(): Promise<void> {
      if (runningRef.current) {
        rerunRef.current = true;
        return;
      }

      runningRef.current = true;
      try {
        do {
          rerunRef.current = false;
          const latest = latestRef.current;
          if (!latest.agent || !latest.identities?.length) {
            return;
          }

          const result = await reconcileIdentitySync(
            latest.agent,
            latest.identities,
            DEFAULT_DWN_ENDPOINTS,
          );

          if (result.changedDids.length > 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
            for (const did of result.changedDids) {
              queryClient.invalidateQueries({
                queryKey: queryKeys.identities.profile(did),
              });
            }
          }
        } while (rerunRef.current);
      } catch (error) {
        console.warn('Identity sync reconciliation failed:', error);
      } finally {
        runningRef.current = false;
      }
    }

    void run();
  }, [agent, identityKey, queryClient]);
}
