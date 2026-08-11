import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { useWallets } from '../use-wallets';

const mocks = vi.hoisted(() => {
  const connectProtocol = Symbol('ConnectProtocol');
  const closeView = vi.fn(async () => undefined);
  const closeEnbox = vi.fn();
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
    closeEnbox,
    closeView,
    connectProtocol,
    observe,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        close: closeEnbox,
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
    expect(mocks.closeEnbox).toHaveBeenCalledOnce();
    expect(mocks.closeView).toHaveBeenCalledOnce();
  });

  it('releases its abort listener when opening the view fails', async () => {
    useAuthStore.setState({ agent: {} });
    const failure = new Error('Unable to open view');
    let signal: AbortSignal | undefined;
    mocks.observe.mockImplementationOnce(async (_path, options) => {
      signal = options.signal;
      throw failure;
    });

    const { result } = renderHook(() => useWallets('did:dht:alice'));

    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(mocks.closeEnbox).toHaveBeenCalledOnce();

    mocks.closeEnbox.mockClear();
    signal?.dispatchEvent(new Event('abort'));
    expect(mocks.closeEnbox).not.toHaveBeenCalled();
  });
});
