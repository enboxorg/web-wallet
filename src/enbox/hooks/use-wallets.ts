/** Reactive wallet-connection records for one identity. */

import type { WalletData } from '@enbox/protocols';

import { useMemo } from 'react';

import { Enbox } from '@enbox/browser';
import { ConnectProtocol } from '@enbox/protocols';
import { useRecordView } from '@enbox/react';

import { useAuthStore } from '../../stores/auth-store';

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
      return enbox.using(ConnectProtocol).records.observe('wallet', {
        materialize : true,
        pagination  : { limit: WALLET_PAGE_LIMIT },
        signal,
      });
    };
  }, [agent, did]);

  const snapshot = useRecordView(opener);
  const wallets = snapshot.records.map(({ value }) => value);
  const error = snapshot.status === 'error' ? snapshot.error : undefined;
  const loading = snapshot.status === 'loading';

  return {
    wallets,
    loading,
    empty   : snapshot.status === 'ready' && wallets.length === 0,
    error,
  };
}
