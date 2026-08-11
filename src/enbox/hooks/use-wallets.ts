/**
 * Reactive wallet-connection records for one identity.
 *
 * Adopts `enbox.records.observe()` (the new local observed-view API) in place
 * of the previous `useQuery(fetchWallets)` one-shot read: the view keeps the
 * list current on its own — a wallet record written or removed on the connected
 * tenant's local replica rematerializes the snapshot without any manual
 * `agent.sync.on(...)` invalidation. (Wallets had no sync-driven invalidation
 * before, so this is net-new reactivity.)
 */

import type { WalletData } from '@enbox/protocols';

import { useMemo } from 'react';

import { Enbox } from '@enbox/browser';
import { ConnectProtocol } from '@enbox/protocols';

import { useAuthStore } from '../../stores/auth-store';
import { useRecordsView } from './use-records-view';

const WALLET_PAGE_LIMIT = 1;

export interface UseWalletsResult {
  /** Decoded wallet-record payloads. */
  wallets: WalletData[];
  loading: boolean;
  empty: boolean;
  error?: Error;
}

export function useWallets(did: string | undefined): UseWalletsResult {
  const agent = useAuthStore((state) => state.agent);

  const opener = useMemo(() => {
    if (agent === null || did === undefined) {
      return null;
    }
    return async (signal: AbortSignal) => {
      const enbox = new Enbox({ agent, connectedDid: did, signal });
      const closeEnbox = (): void => enbox.close();
      signal.addEventListener('abort', closeEnbox, { once: true });
      try {
        return await enbox
          .using(ConnectProtocol)
          .records.observe('wallet', {
            materialize : true,
            pagination  : { limit: WALLET_PAGE_LIMIT },
            signal,
          });
      } catch (error) {
        signal.removeEventListener('abort', closeEnbox);
        closeEnbox();
        throw error;
      }
    };
  }, [agent, did]);

  const snapshot = useRecordsView(opener);
  const wallets = snapshot.records.map(({ value }) => value);
  const error = snapshot.status === 'error' ? snapshot.error : undefined;
  const loading = snapshot.status === 'loading';

  return {
    wallets,
    loading,
    empty   : !loading && error === undefined && wallets.length === 0,
    error,
  };
}
