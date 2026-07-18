import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { RemoteSyncStatusPanel } from '../RemoteSyncStatusPanel';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries  : { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterAll(() => {
  useAuthStore.setState({ agent: null });
});

describe('RemoteSyncStatusPanel', () => {
  it('renders each remote state and quota detail', async () => {
    useAuthStore.setState({
      agent: {
        sync: {
          getRemoteSyncStatus: vi.fn(async () => [
            {
              tenantDid               : 'did:dht:alice',
              remoteEndpoint          : 'https://healthy.example/dwn',
              state                   : 'healthy',
              connectivity            : 'online',
              quotaBlockedMessageCount: 0,
              failedMessageCount      : 0,
            },
            {
              tenantDid               : 'did:dht:alice',
              remoteEndpoint          : 'https://full.example/dwn',
              state                   : 'quota-blocked',
              connectivity            : 'online',
              quotaBlockedMessageCount: 2,
              failedMessageCount      : 0,
              lastError               : 'Tenant storage quota exceeded',
            },
          ]),
          retryRemoteNow: vi.fn(),
        },
      },
    });

    render(<RemoteSyncStatusPanel did="did:dht:alice" />, { wrapper: createWrapper() });

    expect(await screen.findByText('https://healthy.example/dwn')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Quota blocked')).toBeInTheDocument();
    expect(screen.getByText(/2 messages are waiting for remote quota/i)).toBeInTheDocument();
    expect(screen.getByText(/tenant storage quota exceeded/i)).toBeInTheDocument();
  });

  it('retries only the selected quota-blocked remote', async () => {
    const retryRemoteNow = vi.fn(async () => undefined);
    useAuthStore.setState({
      agent: {
        sync: {
          getRemoteSyncStatus: vi.fn(async () => [{
            tenantDid               : 'did:dht:alice',
            remoteEndpoint          : 'https://full.example/dwn',
            state                   : 'quota-blocked',
            connectivity            : 'online',
            quotaBlockedMessageCount: 1,
            failedMessageCount      : 0,
          }]),
          retryRemoteNow,
        },
      },
    });

    render(<RemoteSyncStatusPanel did="did:dht:alice" />, { wrapper: createWrapper() });

    fireEvent.click(await screen.findByRole('button', { name: /retry now/i }));

    await waitFor(() => {
      expect(retryRemoteNow).toHaveBeenCalledWith(
        'did:dht:alice',
        'https://full.example/dwn',
      );
    });
  });
});
