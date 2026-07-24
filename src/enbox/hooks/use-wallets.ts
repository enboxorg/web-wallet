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

import { useEffect, useMemo, useState } from 'react';

import { Enbox } from '@enbox/api';
import { ConnectProtocol } from '@enbox/protocols';

import type { EnboxAgent } from '../types';
import { useAuthStore } from '../../stores/auth-store';
import { useRecordsView } from './use-records-view';

const WALLET_PAGE_LIMIT = 100;

export interface UseWalletsResult {
  /** Decoded wallet-record payloads (schema is intentionally loose). */
  wallets: unknown[];
  loading: boolean;
  empty: boolean;
  error?: Error;
}

interface MaterializedWallets {
  wallets: unknown[];
  /** Number of source record handles this array was materialized from. */
  count: number;
  error?: Error;
}

const NOT_MATERIALIZED = -1;

export function useWallets(did: string | undefined): UseWalletsResult {
  const agent = useAuthStore((state) => state.agent) as EnboxAgent | null;

  const opener = useMemo(() => {
    if (agent === null || did === undefined) {
      return null;
    }
    return async () => {
      const enbox = new Enbox({ agent, connectedDid: did });
      return enbox
        .using(ConnectProtocol)
        .records.observe('wallet', { pagination: { limit: WALLET_PAGE_LIMIT } });
    };
  }, [agent, did]);

  const snapshot = useRecordsView(opener);

  // Record handles decrypt lazily; materialize each snapshot's JSON payloads.
  const [materialized, setMaterialized] = useState<MaterializedWallets>({
    wallets : [],
    count   : NOT_MATERIALIZED,
  });

  useEffect(() => {
    let cancelled = false;
    const records = snapshot.records;
    void Promise.all(records.map((record) => record.data.json()))
      .then((wallets) => {
        if (!cancelled) {
          setMaterialized({ wallets, count: records.length });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setMaterialized({
            wallets : [],
            count   : records.length,
            error   : cause instanceof Error ? cause : new Error(String(cause)),
          });
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [snapshot.records]);

  const error = snapshot.state === 'error' ? snapshot.error : materialized.error;
  const materializing =
    error === undefined && snapshot.records.length > 0 && materialized.count !== snapshot.records.length;
  const loading = snapshot.state === 'loading' || materializing;

  return {
    wallets : materialized.wallets,
    loading,
    empty   : !loading && error === undefined && materialized.wallets.length === 0,
    error,
  };
}
