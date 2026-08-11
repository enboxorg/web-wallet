/**
 * Bridges the async `enbox.records.observe()` reactive view into React via
 * `useSyncExternalStore`.
 *
 * `records.observe()` returns a `RecordView` that installs its own local wake
 * subscription, runs the first query, and rematerializes on change — so it
 * replaces the manual `records.query()` + `agent.sync.on(...)` invalidation
 * bridge for a single owned-data collection. The only impedance mismatch is
 * that opening the view is asynchronous while `useSyncExternalStore` needs a
 * synchronous `getSnapshot`/`subscribe`. The effect below opens the view only
 * after commit and owns both its abort signal and teardown.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { RecordView, RecordViewState } from '@enbox/browser';

/** Opens one local observed view. Return `null` to keep the hook idle. */
export type RecordViewOpener<T> = (signal: AbortSignal) => Promise<RecordView<T>>;

function loadingSnapshot<T>(): RecordViewState<T> {
  return { records: [], hasMore: false, status: 'loading', current: false };
}

const LOADING_SNAPSHOT = loadingSnapshot<never>();

type OpenedView<T> = {
  opener: RecordViewOpener<T>;
  view?: RecordView<T>;
  error?: RecordViewState<T>;
};

function idleSubscribe(): () => void {
  return (): void => {};
}

/**
 * Subscribes to a local observed records view. `opener` MUST be memoized by the
 * caller (e.g. `useMemo`/`useCallback` keyed on agent + connected DID + path);
 * a new opener identity reopens the view. Returns the current immutable
 * state, including whether the local projection is current.
 */
export function useRecordsView<T>(opener: RecordViewOpener<T> | null): RecordViewState<T> {
  const [opened, setOpened] = useState<OpenedView<T>>();

  useEffect(() => {
    if (opener === null) {
      return;
    }
    const controller = new AbortController();
    let view: RecordView<T> | undefined;
    void opener(controller.signal).then(
      (nextView): void => {
        if (controller.signal.aborted) {
          void nextView.close();
          return;
        }
        view = nextView;
        setOpened({ opener, view });
      },
      (error: unknown): void => {
        if (!controller.signal.aborted) {
          setOpened({
            opener,
            error: {
              records : [],
              hasMore : false,
              status  : 'error',
              current : false,
              error   : error instanceof Error ? error : new Error(String(error)),
            },
          });
        }
      },
    );

    return (): void => {
      controller.abort();
      void view?.close();
      setOpened((current) => current?.opener === opener ? undefined : current);
    };
  }, [opener]);

  const current = opened?.opener === opener ? opened : undefined;
  const view = current?.view;
  const fallback = current?.error ?? LOADING_SNAPSHOT as RecordViewState<T>;
  const subscribe = useCallback(
    (listener: () => void): (() => void) => view?.subscribe(listener) ?? idleSubscribe(),
    [view],
  );
  const getSnapshot = useCallback(
    (): RecordViewState<T> => view?.getSnapshot() ?? fallback,
    [fallback, view],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
