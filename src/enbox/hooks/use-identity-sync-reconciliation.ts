import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuthStore } from '@/stores/auth-store';

import { getIdentitySyncTargets, reconcileIdentitySync } from '../identity-sync';
import { queryKeys } from '../queries/query-keys';

export function useIdentitySyncReconciliation(identities: unknown[] | undefined): void {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const externalRerunRef = useRef(false);
  const unmountedRef = useRef(false);
  const reconciledByAgentRef = useRef(new WeakMap<object, Set<string>>());
  const latestRef = useRef({ agent, identities });
  latestRef.current = { agent, identities };

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const identityKey = useMemo(() => {
    const ownerDids = getIdentitySyncTargets(identities ?? [])
      .filter((target) => target.delegateDid === undefined)
      .map((target) => target.connectedDid)
      .sort();
    return ownerDids.length === 0 ? '' : JSON.stringify(ownerDids);
  }, [identities]);

  useEffect(() => {
    if (!agent) {
      return;
    }
    if (!identityKey) {
      // Clear reconciled DIDs when the last identity is deleted so re-importing
      // the same DID later in this session reconciles cleanly.
      reconciledByAgentRef.current.get(agent)?.clear();
      return;
    }

    async function run(): Promise<void> {
      if (runningRef.current) {
        rerunRef.current = true;
        externalRerunRef.current = true;
        return;
      }

      runningRef.current = true;
      let retriesRemaining = 1;
      try {
        do {
          rerunRef.current = false;
          if (externalRerunRef.current) {
            retriesRemaining = 1;
            externalRerunRef.current = false;
          }
          const latest = latestRef.current;
          const activeAgent = latest.agent;
          if (
            unmountedRef.current
            || !activeAgent
            || !latest.identities?.length
            || useAuthStore.getState().agent !== activeAgent
          ) {
            if (rerunRef.current && !unmountedRef.current) {
              continue;
            }
            return;
          }

          let reconciled = reconciledByAgentRef.current.get(activeAgent);
          if (reconciled === undefined) {
            reconciled = new Set<string>();
            reconciledByAgentRef.current.set(activeAgent, reconciled);
          }

          const currentOwnerDids = new Set<string>();
          const unreconciledIdentities: unknown[] = [];
          const attemptedOwnerDids: string[] = [];
          const seenUnreconciled = new Set<string>();
          for (const identity of latest.identities) {
            const target = getIdentitySyncTargets([identity])[0];
            if (target === undefined || target.delegateDid !== undefined) {
              continue;
            }
            currentOwnerDids.add(target.connectedDid);
            if (!reconciled.has(target.connectedDid) && !seenUnreconciled.has(target.connectedDid)) {
              seenUnreconciled.add(target.connectedDid);
              unreconciledIdentities.push(identity);
              attemptedOwnerDids.push(target.connectedDid);
            }
          }
          for (const did of reconciled) {
            if (!currentOwnerDids.has(did)) {
              reconciled.delete(did);
            }
          }
          if (unreconciledIdentities.length === 0) {
            if (rerunRef.current && !unmountedRef.current) {
              continue;
            }
            return;
          }

          try {
            const result = await reconcileIdentitySync(
              activeAgent,
              unreconciledIdentities,
            );
            if (unmountedRef.current) {
              return;
            }
            if (useAuthStore.getState().agent !== activeAgent) {
              if (rerunRef.current) {
                continue;
              }
              return;
            }

            const latestOwnerDids = new Set(
              getIdentitySyncTargets(latestRef.current.identities ?? [])
                .filter((target) => target.delegateDid === undefined)
                .map((target) => target.connectedDid),
            );
            if (latestOwnerDids.size === 0) {
              reconciled.clear();
            } else {
              const failedSet = new Set(result.failedDids);
              for (const did of attemptedOwnerDids) {
                if (!failedSet.has(did) && latestOwnerDids.has(did)) {
                  reconciled.add(did);
                }
              }
            }

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
          } catch (error) {
            if (unmountedRef.current) {
              return;
            }
            if (useAuthStore.getState().agent !== activeAgent) {
              if (rerunRef.current) {
                continue;
              }
              return;
            }
            console.error('Identity reconciliation failed:', error);
            toast.error(
              'Couldn’t finish setting up a new profile. Reload the wallet to retry.',
            );
          }
        } while (rerunRef.current);
      } finally {
        runningRef.current = false;
      }
    }

    void run();
  }, [agent, identityKey, queryClient]);
}
