import type { ReactNode } from 'react';
import type { ReplicationLinkSnapshot, RemoteSyncStatus, SyncIdentityStatus } from '@enbox/agent';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth-store';
import { RemoteSyncStatusPanel } from '../RemoteSyncStatusPanel';
import { summarizeSync } from '../sync-summary';

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
              scope          : { kind: 'moduleSet', modules: ['profile', 'connect'] },
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
    // One summary line; a problem opens the per-server details on its own.
    expect(screen.getByText('1 of 2 servers needs attention')).toBeInTheDocument();
    expect(screen.getByText(/^full\.example: 2 changes are waiting/)).toBeInTheDocument();
    expect(screen.getByTestId('sync-summary')).toHaveAttribute('open');
    expect(screen.getByText(/^2 changes are waiting because this server's storage is full/i)).toBeInTheDocument();
    expect(screen.getByText(/tenant storage quota exceeded/i)).toBeInTheDocument();
    expect(screen.getByText('Up to date')).toBeInTheDocument();
    expect(screen.getByText('2 modules')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Catching up (0 of 1 done)')).toBeInTheDocument();
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
              module      : 'https://example.com/notebook',
              contextId     : 'notebook-1',
              modulePaths : ['notebook/page'],
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
    expect(screen.getByText('Catching up (0 of 1 done)')).toBeInTheDocument();
  });
});

describe('summarizeSync', () => {
  const remote = (remoteEndpoint: string, state: RemoteSyncStatus['state'], extra: Partial<RemoteSyncStatus> = {}): RemoteSyncStatus => ({
    tenantDid               : 'did:dht:alice',
    remoteEndpoint,
    state,
    connectivity            : state === 'offline' ? 'offline' : 'online',
    quotaBlockedMessageCount: 0,
    failedMessageCount      : 0,
    ...extra,
  } as RemoteSyncStatus);
  const link = (remoteEndpoint: string, isPullCurrent: boolean): ReplicationLinkSnapshot => ({
    tenantDid    : 'did:dht:alice',
    remoteEndpoint,
    scope        : { kind: 'full' },
    status       : isPullCurrent ? 'live' : 'initializing',
    connectivity : 'online',
    isPullCurrent,
  } as ReplicationLinkSnapshot);

  it('reads "All synced" and stays collapsed when every server is current', () => {
    const summary = summarizeSync(
      [remote('https://a.example', 'healthy', { lastActivityAt: new Date().toISOString() }), remote('https://b.example', 'healthy')],
      [link('https://a.example', true), link('https://b.example', true)],
    );
    expect(summary).toMatchObject({ tone: 'ok', headline: 'All synced', needsAttention: false });
    expect(summary.detail).toMatch(/^2 servers · last synced /);
  });

  it('reports catching up without asking for attention', () => {
    const summary = summarizeSync(
      [remote('https://a.example', 'healthy'), remote('https://b.example', 'healthy')],
      [link('https://a.example', true), link('https://b.example', false)],
    );
    expect(summary).toMatchObject({ tone: 'progress', headline: 'Syncing', detail: 'Catching up with 1 of 2 servers', needsAttention: false });
  });

  it('calls out an unreachable network once rather than per server', () => {
    const summary = summarizeSync([remote('https://a.example', 'offline'), remote('https://b.example', 'offline')], []);
    expect(summary).toMatchObject({ tone: 'offline', headline: 'Can’t reach your sync servers', needsAttention: true });
  });

  it('lets the worst problem set the tone', () => {
    const summary = summarizeSync(
      [remote('https://a.example', 'quota-blocked', { quotaBlockedMessageCount: 1 }), remote('https://b.example', 'degraded', { failedMessageCount: 3 })],
      [],
    );
    expect(summary).toMatchObject({ tone: 'error', headline: '2 of 2 servers need attention', needsAttention: true });
  });
});
