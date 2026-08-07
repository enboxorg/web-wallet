import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { useWallets } from '../use-wallets';

const mocks = vi.hoisted(() => {
  const connectProtocol = Symbol('ConnectProtocol');
  const close = vi.fn(async () => undefined);
  const observe = vi.fn(async () => ({
    close,
    getState: () => ({
      records: [{
        record : { id: 'wallet-record' },
        value  : { webWallets: ['https://wallet.example'] },
      }],
      hasMore : false,
      status  : 'ready',
      current : true,
    }),
    subscribe: vi.fn(() => (): void => {}),
  }));

  return {
    close,
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

vi.mock('@enbox/api', () => ({
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
    });

    unmount();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
