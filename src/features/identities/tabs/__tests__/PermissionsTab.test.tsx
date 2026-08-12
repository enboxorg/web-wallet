import type { ConnectSessionMetadata, DwnPermissionGrant } from '@enbox/agent';

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/enbox/queries/query-keys';
import { renderWithProviders } from '@/test-utils';
import PermissionsTab from '../PermissionsTab';

const mocks = vi.hoisted(() => ({
  permissions: [] as DwnPermissionGrant[],
  createRevocation: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: () => ({
    data      : mocks.permissions,
    isLoading : false,
    isError   : false,
    error     : null,
  }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { agent: unknown }) => unknown) => selector({
    agent: {
      permissions: { createRevocation: mocks.createRevocation },
    },
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success : mocks.toastSuccess,
    error   : mocks.toastError,
  },
}));

type TestConnectSession = ConnectSessionMetadata & {
  applicationId?: string;
};

function permissionGrant({
  id,
  session,
  grantee = 'did:dht:delegate',
  protocol = 'https://identity.foundation/protocols/profile',
  method = 'Read',
}: {
  id: string;
  session: TestConnectSession;
  grantee?: string;
  protocol?: string;
  method?: string;
}): DwnPermissionGrant {
  return {
    id,
    grantee,
    dateGranted    : session.createdAt,
    dateExpires    : session.expiresAt,
    connectSession : session,
    scope          : {
      interface: 'Records',
      method,
      protocol,
    },
  } as DwnPermissionGrant;
}

const activeSession: TestConnectSession = {
  id            : 'active-session',
  applicationId : 'com.example.notes',
  appName       : 'Example Notes',
  createdAt     : '2026-06-23T00:00:00.000Z',
  expiresAt     : '2099-06-24T00:00:00.000Z',
  origin        : 'https://APP.example:443/connect',
  userAgent     : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  platform      : 'MacIntel',
  timezone      : 'America/New_York',
  transport     : 'postMessage',
};

const expiredSession: TestConnectSession = {
  id            : 'expired-session',
  applicationId : 'com.example.notes',
  appName       : 'Example Notes',
  createdAt     : '2025-01-02T00:00:00.000Z',
  expiresAt     : '2025-01-03T00:00:00.000Z',
  origin        : 'https://app.example',
  userAgent     : 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  platform      : 'Linux x86_64',
  timezone      : 'Europe/London',
  transport     : 'relay',
};

describe('PermissionsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permissions = [
      permissionGrant({ id: 'grant-1', session: activeSession }),
      permissionGrant({ id: 'grant-2', session: activeSession, method: 'Write' }),
      permissionGrant({
        id      : 'grant-3',
        session : expiredSession,
        grantee : 'did:dht:expired-delegate',
      }),
    ];
    mocks.createRevocation.mockResolvedValue(undefined);
  });

  it('shows verified popup and reported relay identities as separate apps', async () => {
    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    expect(screen.getByRole('heading', { name: 'Connected Apps' })).toBeInTheDocument();

    // Only apps holding active access are shown by default — the reported
    // relay app (expired session) stays hidden behind the inactive toggle.
    expect(screen.getByText('1 app')).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: 'Example Notes' })).toHaveLength(1);
    expect(screen.queryByText('Firefox on Linux')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show inactive sessions \(1\)/i }));

    expect(screen.getByText('2 apps')).toBeInTheDocument();

    const applications = screen.getAllByRole('article', { name: 'Example Notes' });
    const verifiedApplication = applications.find((application) =>
      within(application).queryByText('Website origin verified') !== null
    );
    const reportedApplication = applications.find((application) =>
      within(application).queryByText('App identity not verified by wallet') !== null
    );
    expect(verifiedApplication).toBeDefined();
    expect(reportedApplication).toBeDefined();

    const verified = within(verifiedApplication!);
    expect(verified.getAllByText('https://app.example').length).toBeGreaterThanOrEqual(1);
    expect(verified.getByText('App ID: com.example.notes')).toBeInTheDocument();
    expect(verified.getByText('1 session · 1 active')).toBeInTheDocument();
    expect(verified.getByRole('heading', { name: 'Safari on macOS' })).toBeInTheDocument();
    expect(verified.queryByRole('heading', { name: 'Firefox on Linux' })).not.toBeInTheDocument();
    expect(verified.getAllByText('Active').length).toBeGreaterThanOrEqual(1);
    expect(verified.getByText('Access available until')).toBeInTheDocument();
    expect(verified.getAllByText('Time zone')).toHaveLength(1);
    expect(verified.getAllByText('America/New_York').length).toBeGreaterThanOrEqual(1);
    expect(verified.getAllByText('Browser popup').length).toBeGreaterThanOrEqual(1);
    expect(verified.queryByText('Relay')).not.toBeInTheDocument();

    const reported = within(reportedApplication!);
    expect(reported.getAllByText('https://app.example').length).toBeGreaterThanOrEqual(1);
    expect(reported.getByText('App ID: com.example.notes')).toBeInTheDocument();
    expect(reported.getByText('1 session · 0 active')).toBeInTheDocument();
    expect(reported.getByRole('heading', { name: 'Firefox on Linux' })).toBeInTheDocument();
    expect(reported.queryByRole('heading', { name: 'Safari on macOS' })).not.toBeInTheDocument();
    expect(reported.getAllByText('Expired').length).toBeGreaterThanOrEqual(1);
    expect(reported.getByText('Access expired')).toBeInTheDocument();
    expect(reported.getAllByText('Time zone')).toHaveLength(1);
    expect(reported.getAllByText('Europe/London').length).toBeGreaterThanOrEqual(1);
    expect(reported.getAllByText('Relay').length).toBeGreaterThanOrEqual(1);
    expect(reported.queryByText(/IP location/i)).not.toBeInTheDocument();

    expect(verified.getByRole('button', {
      name: 'Revoke Safari on macOS session for Example Notes',
    })).toBeInTheDocument();
    expect(reported.queryByRole('button', {
      name: 'Revoke Firefox on Linux session for Example Notes',
    })).not.toBeInTheDocument();
    expect(verified.getAllByText(/Permission bundle ·/)).toHaveLength(1);
    expect(reported.getAllByText(/Permission bundle ·/)).toHaveLength(1);

    const permissionBundle = verified.getByRole('group', {
      name: /Permission bundle approved/,
    });
    expect(permissionBundle).not.toHaveAttribute('open');
    await user.click(within(permissionBundle).getByText(/Permission bundle ·/));
    expect(permissionBundle).toHaveAttribute('open');
    expect(within(permissionBundle).getByRole('button', {
      name: 'Revoke Profile Read permission',
    })).toBeInTheDocument();
  });

  it('hides expired sessions again when the inactive toggle is switched off', async () => {
    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    await user.click(screen.getByRole('button', { name: /show inactive sessions \(1\)/i }));
    expect(screen.getByText('Firefox on Linux')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /hide inactive sessions/i }));
    expect(screen.queryByText('Firefox on Linux')).not.toBeInTheDocument();
    expect(screen.getByText('Safari on macOS')).toBeInTheDocument();
  });

  it('offers the inactive toggle when no app currently has access', () => {
    mocks.permissions = [
      permissionGrant({
        id      : 'grant-expired',
        session : expiredSession,
        grantee : 'did:dht:expired-delegate',
      }),
    ];

    renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    expect(screen.queryByRole('heading', { name: 'Connected Apps' })).not.toBeInTheDocument();
    expect(screen.getByText(/no apps currently have access/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /show inactive sessions \(1\)/i }),
    ).toBeInTheDocument();
  });

  it('refreshes both permission views and reports a partial session revocation', async () => {
    mocks.createRevocation.mockImplementation(({ grant }: { grant: DwnPermissionGrant }) =>
      grant.id === 'grant-2'
        ? Promise.reject(new Error('revocation failed'))
        : Promise.resolve(undefined));

    const { user, queryClient } = renderWithProviders(
      <PermissionsTab did="did:dht:owner" />,
    );
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', {
      name: 'Revoke Safari on macOS session for Example Notes',
    }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke session' }));

    await waitFor(() => {
      expect(mocks.createRevocation).toHaveBeenCalledTimes(2);
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Revoked 1 of 2 permissions. 1 could not be revoked; try again.',
      );
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.permissions('did:dht:owner'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.permissionHistory('did:dht:owner'),
    });
  });

  it('revokes every active approval bundle for one stable delegate session', async () => {
    const renewedSession: TestConnectSession = {
      ...activeSession,
      id        : 'renewed-approval',
      createdAt : '2026-06-24T00:00:00.000Z',
      expiresAt : '2099-07-24T00:00:00.000Z',
    };
    const oldExpiredSession: TestConnectSession = {
      ...activeSession,
      id        : 'expired-approval',
      createdAt : '2025-06-24T00:00:00.000Z',
      expiresAt : '2025-07-24T00:00:00.000Z',
    };
    mocks.permissions = [
      permissionGrant({ id: 'original-grant', session: activeSession }),
      permissionGrant({ id: 'renewed-grant', session: renewedSession }),
      permissionGrant({ id: 'expired-grant', session: oldExpiredSession }),
    ];

    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);
    const application = screen.getByRole('article', { name: 'Example Notes' });

    expect(within(application).getByText('1 session · 1 active')).toBeInTheDocument();
    expect(within(application).getByText('Last renewed')).toBeInTheDocument();
    expect(within(application).getAllByText(/Permission bundle ·/)).toHaveLength(3);

    await user.click(within(application).getByRole('button', {
      name: 'Revoke Safari on macOS session for Example Notes',
    }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', {
      name: 'Revoke session',
    }));

    await waitFor(() => expect(mocks.createRevocation).toHaveBeenCalledTimes(2));
    expect(mocks.createRevocation.mock.calls.map(([params]) => params.grant.id)).toEqual(
      expect.arrayContaining(['original-grant', 'renewed-grant']),
    );
    expect(mocks.createRevocation.mock.calls.map(([params]) => params.grant.id))
      .not.toContain('expired-grant');
  });
});
