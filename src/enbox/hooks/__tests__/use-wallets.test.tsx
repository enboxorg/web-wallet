import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { useWallets } from '../use-wallets';

const mocks = vi.hoisted(() => {
  const connectProtocol = Symbol('ConnectProtocol');
  const closeView = vi.fn(async () => undefined);
  const snapshot = {
    records: [{
      record : { id: 'wallet-record' },
      value  : { webWallets: ['https://wallet.example'] },
    }],
    hasMore : false,
    status  : 'ready' as const,
    current : true,
  };
  const observe = vi.fn(async () => ({
    close: closeView,
    getSnapshot: () => snapshot,
    subscribe: vi.fn(() => (): void => {}),
  }));

  return {
    closeView,
    connectProtocol,
    observe,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        using: vi.fn((protocol) => {
          if (protocol !== connectProtocol) {
            throw new Error('Unexpected protocol');
          }
          return { records: { observe } };
        }),
      };
    }),
  };
});

vi.mock('@enbox/browser', () => ({
  Enbox: mocks.Enbox,
}));

vi.mock('@enbox/protocols', () => ({
  ConnectProtocol: mocks.connectProtocol,
}));

afterEach(() => {
  useAuthStore.setState({ agent: null });
  vi.clearAllMocks();
});

describe('useWallets', () => {
  it('stays idle without an unlocked agent or selected identity', () => {
    const { result } = renderHook(() => useWallets(undefined));
    expect(result.current).toMatchObject({ wallets: [], loading: false, empty: false });
    expect(mocks.observe).not.toHaveBeenCalled();
    expect(mocks.Enbox).not.toHaveBeenCalled();
  });

  it('renders decoded values from the SDK materialized view', async () => {
    useAuthStore.setState({ agent: {} });

    const { result, unmount } = renderHook(() => useWallets('did:dht:alice'));

    await waitFor(() => {
      expect(result.current.wallets).toEqual([{ webWallets: ['https://wallet.example'] }]);
    });
    expect(result.current.loading).toBe(false);
    expect(mocks.observe).toHaveBeenCalledWith('wallet', {
      materialize : true,
      pagination  : { limit: 1 },
      signal      : expect.any(AbortSignal),
    });

    unmount();
    const signal = mocks.Enbox.mock.calls[0][0].signal;
    expect(signal.aborted).toBe(true);
    expect(mocks.closeView).toHaveBeenCalledOnce();
  });

  it('retires the native facade lifetime when opening the view fails', async () => {
    useAuthStore.setState({ agent: {} });
    const failure = new Error('Unable to open view');
    let signal: AbortSignal | undefined;
    mocks.observe.mockImplementationOnce(async (_path, options) => {
      signal = options.signal;
      throw failure;
    });

    const { result } = renderHook(() => useWallets('did:dht:alice'));

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(signal?.aborted).toBe(true);
  });
});
