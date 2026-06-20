import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { useSyncConnectivity } from '../use-sync-connectivity';

afterEach(() => {
  useAuthStore.setState({ agent: null });
});

describe('useSyncConnectivity', () => {
  it('returns unknown when no agent is available', () => {
    useAuthStore.setState({ agent: null });
    const { result } = renderHook(() => useSyncConnectivity());
    expect(result.current).toBe('unknown');
  });

  it('seeds from the agent connectivity state', () => {
    useAuthStore.setState({
      agent: { sync: { connectivityState: 'online', on: () => () => {} } },
    });
    const { result } = renderHook(() => useSyncConnectivity());
    expect(result.current).toBe('online');
  });

  it('updates when the sync engine emits a connectivity change', () => {
    let listener: ((event: { type: string }) => void) | undefined;
    const sync = {
      connectivityState: 'online',
      on: (cb: (event: { type: string }) => void) => {
        listener = cb;
        return () => {};
      },
    };
    useAuthStore.setState({ agent: { sync } });

    const { result } = renderHook(() => useSyncConnectivity());
    expect(result.current).toBe('online');

    sync.connectivityState = 'offline';
    act(() => {
      listener?.({ type: 'link:connectivity-change' });
    });
    expect(result.current).toBe('offline');
  });
});
