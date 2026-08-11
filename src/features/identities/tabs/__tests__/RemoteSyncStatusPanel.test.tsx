import type { ReactNode } from 'react';
import type { ReplicationLinkSnapshot, RemoteSyncStatus, SyncIdentityStatus } from '@enbox/agent';

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

function createSyncStatus(
  remotes: RemoteSyncStatus[],
  links: ReplicationLinkSnapshot[],
): SyncIdentityStatus {
  return {
    registration : undefined,
    health       : {
      connectivity            : 'online',
      failedMessageCount      : 0,
      degradedLinkCount       : 0,
      quotaBlockedMessageCount: 0,
      syncHealthy             : true,
    },
    connectivity : 'online',
    currentness  : 'caught-up',
    remotes,
    links,
  };
}

describe('RemoteSyncStatusPanel', () => {
  it('renders each remote state and quota detail', async () => {
    useAuthStore.setState({
      agent: {
        sync: {
          getIdentitySyncStatus: vi.fn(async () => createSyncStatus([
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
          ], [
            {
              tenantDid      : 'did:dht:alice',
              remoteEndpoint : 'https://healthy.example/dwn',
              scope          : { kind: 'protocolSet', protocols: ['profile', 'connect'] },
              status         : 'live',
              connectivity   : 'online',
              isPullCurrent  : true,
            },
            {
              tenantDid      : 'did:dht:alice',
              remoteEndpoint : 'https://full.example/dwn',
              scope          : { kind: 'full' },
              status         : 'repairing',
              connectivity   : 'online',
              isPullCurrent  : false,
            },
          ])),
          on: vi.fn(() => () => {}),
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
    expect(screen.getByText('Replication link caught up')).toBeInTheDocument();
    expect(screen.getByText('2 protocols')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 replication link caught up')).toBeInTheDocument();
    expect(screen.getByText('Repairing')).toBeInTheDocument();
  });

  it('retries only the selected quota-blocked remote', async () => {
    const retryRemoteNow = vi.fn(async () => undefined);
    useAuthStore.setState({
      agent: {
        sync: {
          getIdentitySyncStatus: vi.fn(async () => createSyncStatus([{
            tenantDid               : 'did:dht:alice',
            remoteEndpoint          : 'https://full.example/dwn',
            state                   : 'quota-blocked',
            connectivity            : 'online',
            quotaBlockedMessageCount: 1,
            failedMessageCount      : 0,
          }], [])),
          on: vi.fn(() => () => {}),
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

  it('renders followed-context replication links', async () => {
    useAuthStore.setState({
      agent: {
        sync: {
          getIdentitySyncStatus: vi.fn(async () => createSyncStatus([{
            tenantDid               : 'did:dht:owner',
            remoteEndpoint          : 'https://shared.example/dwn',
            state                   : 'healthy',
            connectivity            : 'online',
            quotaBlockedMessageCount: 0,
            failedMessageCount      : 0,
          }], [{
            tenantDid      : 'did:dht:owner',
            remoteEndpoint : 'https://shared.example/dwn',
            scope          : {
              kind          : 'context',
              protocol      : 'https://example.com/notebook',
              contextId     : 'notebook-1',
              protocolPaths : ['notebook/page'],
            },
            status       : 'live',
            connectivity : 'online',
            isPullCurrent: false,
          }])),
          on: vi.fn(() => () => {}),
          retryRemoteNow: vi.fn(),
        },
      },
    });

    render(<RemoteSyncStatusPanel did="did:dht:owner" />, { wrapper: createWrapper() });

    expect(await screen.findByText('Shared context')).toBeInTheDocument();
    expect(screen.getByText('0 of 1 replication link caught up')).toBeInTheDocument();
  });
});
