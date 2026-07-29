import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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
    if (!identities?.length) {
      return '';
    }

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
      let retriesRemaining = 1;
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
          );

          if (result.changedDids.length > 0) {
            queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
            for (const did of result.changedDids) {
              queryClient.invalidateQueries({
                queryKey: queryKeys.identities.profile(did),
              });
            }
          }
          if (result.failedDids.length > 0) {
            if (retriesRemaining > 0) {
              retriesRemaining -= 1;
              rerunRef.current = true;
            } else {
              toast.error('Failed to set up one or more identities. Reload the wallet to retry.');
            }
          }
        } while (rerunRef.current);
      } catch (error) {
        console.error('Identity reconciliation failed:', error);
        toast.error(
          'Failed to set up a new identity. Reload the wallet to retry.',
        );
      } finally {
        runningRef.current = false;
      }
    }

    void run();
  }, [agent, identityKey, queryClient]);
}
