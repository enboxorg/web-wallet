/**
 * Bridges the async `enbox.records.observe()` reactive view into React via
 * `useSyncExternalStore`.
 *
 * `records.observe()` returns a `RecordView` that installs its own local wake
 * subscription, runs the first query, and rematerializes on change — so it
 * replaces the manual `records.query()` + `agent.sync.on(...)` invalidation
 * bridge for a single owned-data collection. The only impedance mismatch is
 * that opening the view is asynchronous while `useSyncExternalStore` needs a
 * synchronous `getSnapshot`/`subscribe`. `RecordViewStore` closes that gap:
 * it starts in a `'loading'` snapshot, opens the view, forwards its snapshots,
 * and closes the view on teardown.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { RecordView, RecordViewState } from '@enbox/api';

/** Opens one local observed view. Return `null` to keep the hook idle. */
export type RecordViewOpener<T> = () => Promise<RecordView<T>>;

function loadingSnapshot<T>(): RecordViewState<T> {
  return { records: [], hasMore: false, status: 'loading', current: false };
}

/** Stable snapshot returned while the hook is idle (no opener). */
const IDLE_SNAPSHOT = loadingSnapshot<never>();

class RecordViewStore<T> {
  private view: RecordView<T> | null = null;
  private detachView: (() => void) | null = null;
  private snapshot: RecordViewState<T> = loadingSnapshot<T>();
  private readonly listeners = new Set<() => void>();
  private closed = false;

  public constructor(opener: RecordViewOpener<T>) {
    void this.openView(opener);
  }

  private async openView(opener: RecordViewOpener<T>): Promise<void> {
    try {
      const view = await opener();
      if (this.closed) {
        void view.close();
        return;
      }
      this.view = view;
      this.detachView = view.subscribe((snapshot): void => {
        this.snapshot = snapshot;
        this.emit();
      });
      this.snapshot = view.getState();
      this.emit();
    } catch (error) {
      if (this.closed) {
        return;
      }
      this.snapshot = {
        records : [],
        hasMore : false,
        status  : 'error',
        current : false,
        error   : error instanceof Error ? error : new Error(String(error)),
      };
      this.emit();
    }
  }

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  public readonly getSnapshot = (): RecordViewState<T> => this.snapshot;

  public close(): void {
    this.closed = true;
    this.listeners.clear();
    this.detachView?.();
    void this.view?.close();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

function idleSubscribe(): () => void {
  return (): void => {};
}

function idleSnapshot<T>(): RecordViewState<T> {
  return IDLE_SNAPSHOT;
}

/**
 * Subscribes to a local observed records view. `opener` MUST be memoized by the
 * caller (e.g. `useMemo`/`useCallback` keyed on agent + connected DID + path);
 * a new opener identity reopens the view. Returns the current immutable
 * state, including whether the local projection is current.
 */
export function useRecordsView<T>(opener: RecordViewOpener<T> | null): RecordViewState<T> {
  const store = useMemo(() => (opener === null ? null : new RecordViewStore<T>(opener)), [opener]);

  useEffect(() => {
    return (): void => {
      store?.close();
    };
  }, [store]);

  return useSyncExternalStore(
    store === null ? idleSubscribe : store.subscribe,
    store === null ? idleSnapshot<T> : store.getSnapshot,
  );
}
