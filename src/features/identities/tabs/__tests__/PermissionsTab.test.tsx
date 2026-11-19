import type { ConnectSessionMetadata, DwnPermissionGrant } from '@enbox/agent';

import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '@/enbox/queries/query-keys';
import { renderWithProviders } from '@/test-utils';
import { createCanonicalContextCompanionDefinition } from '@/lib/module-names';
import PermissionsTab from '../PermissionsTab';

const mocks = vi.hoisted(() => ({
  permissions: [] as DwnPermissionGrant[],
  modules: [] as Array<{ uri: string; published: boolean; definition: unknown }>,
  createRevocation: vi.fn(),
  renewExpiredSession: vi.fn(),
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

vi.mock('@/enbox/hooks/use-modules', () => ({
  useModules: () => ({ data: mocks.modules }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: { agent: unknown }) => unknown) => selector({
    agent: {
      permissions: { createRevocation: mocks.createRevocation },
    },
  }),
}));

vi.mock('../renew-session', () => ({
  renewExpiredSession: mocks.renewExpiredSession,
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
  module = 'https://identity.foundation/modules/profile',
  method = 'Read',
}: {
  id: string;
  session: TestConnectSession;
  grantee?: string;
  module?: string;
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
      module,
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

const notesModule = 'https://enbox.id/modules/notes/v1';

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
    mocks.modules = [];
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
    mocks.renewExpiredSession.mockResolvedValue(undefined);
  });

  it('shows verified popup and reported relay identities as separate apps', () => {
    renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    expect(screen.getByRole('heading', { name: 'Connected apps' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Past connections' })).toBeInTheDocument();

    const applications = screen.getAllByRole('article', { name: 'Example Notes' });
    expect(applications).toHaveLength(2);
    const verifiedApplication = applications.find((application) =>
      within(application).queryByText('Website origin verified') !== null
    );
    const reportedApplication = applications.find((application) =>
      within(application).queryByText('App identity not verified by wallet') !== null
    );
    expect(verifiedApplication).toBeDefined();
    expect(reportedApplication).toBeDefined();

    const verified = within(verifiedApplication!);
    expect(verified.getByText('app.example')).toBeInTheDocument();
    expect(verified.getByText('App ID: com.example.notes')).toBeInTheDocument();
    expect(verified.getByText('1 device connected')).toBeInTheDocument();
    expect(verified.getByRole('listitem', { name: 'Safari on macOS' })).toBeInTheDocument();
    expect(verified.queryByRole('listitem', { name: 'Firefox on Linux' })).not.toBeInTheDocument();
    expect(verified.getAllByText('America/New_York').length).toBeGreaterThanOrEqual(1);
    expect(verified.getAllByText('Browser popup').length).toBeGreaterThanOrEqual(1);
    expect(verified.queryByText('Relay')).not.toBeInTheDocument();
    expect(verified.getByRole('button', {
      name: 'Revoke Safari on macOS session for Example Notes',
    })).toBeInTheDocument();
    expect(verified.getByRole('button', { name: 'Disconnect Example Notes' })).toBeInTheDocument();

    // The expired relay app keeps a renewable device row and read-only access.
    const reported = within(reportedApplication!);
    expect(reported.getByText('App ID: com.example.notes')).toBeInTheDocument();
    expect(reported.getAllByText('Expired').length).toBeGreaterThanOrEqual(1);
    expect(reported.getByText(/^Access expired /)).toBeInTheDocument();
    expect(reported.getByRole('listitem', { name: 'Firefox on Linux' })).toBeInTheDocument();
    expect(reported.getByText(/^Expired .* ago/)).toBeInTheDocument();
    expect(reported.getByRole('button', {
      name: 'Renew Firefox on Linux session for Example Notes',
    })).toBeInTheDocument();
    expect(reported.queryByRole('button', {
      name: 'Revoke Firefox on Linux session for Example Notes',
    })).not.toBeInTheDocument();
    expect(reported.queryByRole('button', { name: /Disconnect/ })).not.toBeInTheDocument();
    expect(reported.queryByRole('button', { name: /Revoke Example Notes access/ })).not.toBeInTheDocument();
  });

  it('collapses one grant per scope into a single row per module with action chips', () => {
    mocks.permissions = [
      permissionGrant({ id: 'read', session: activeSession, module: notesModule }),
      permissionGrant({ id: 'write', session: activeSession, module: notesModule, method: 'Write' }),
      permissionGrant({ id: 'delete', session: activeSession, module: notesModule, method: 'Delete' }),
      { ...permissionGrant({ id: 'sync', session: activeSession, module: notesModule }), scope: { interface: 'Messages', method: 'Read', module: notesModule } } as DwnPermissionGrant,
      { ...permissionGrant({ id: 'setup', session: activeSession, module: notesModule }), scope: { interface: 'Modules', method: 'Query', module: notesModule } } as DwnPermissionGrant,
      permissionGrant({ id: 'profile', session: activeSession }),
    ];

    renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    const access = screen.getByRole('list', { name: 'Example Notes data access' });
    const rows = within(access).getAllByRole('listitem', { name: /./ });
    // Versioned module URIs are named from their path, never "V1".
    expect(rows.map((row) => within(row).getByText(/^(Notes|Profile)$/).textContent)).toEqual(['Notes', 'Profile']);
    expect(screen.queryByText('V1')).not.toBeInTheDocument();

    const chipLabels = (row: HTMLElement) => within(within(row).getByRole('list', { name: 'Allowed actions' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    // Sync and setup move to one note under the list instead of every row.
    expect(chipLabels(rows[0])).toEqual(['View', 'Add or edit', 'Delete']);
    expect(screen.getAllByText(/also sync changes/i).length).toBeGreaterThan(0);
    expect(chipLabels(rows[1])).toEqual(['View']);
    // Each row shows its module URI in full, as the approval screen did.
    expect(within(rows[0]).getByTestId('module-uri')).toHaveTextContent(notesModule);
    expect(within(rows[1]).getByTestId('module-uri')).toHaveTextContent('https://identity.foundation/modules/profile');
  });

  it('tags shared contexts only when the installed definition proves it', () => {
    const contextsModule = `${notesModule}/contexts`;
    mocks.permissions = [
      permissionGrant({ id: 'contexts-read', session: activeSession, module: contextsModule }),
    ];

    const { unmount } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);
    // URI convention alone: named from the path, but no companion claim.
    const access = screen.getByRole('list', { name: 'Example Notes data access' });
    expect(within(access).getByRole('listitem', { name: 'Notes Contexts' })).toBeInTheDocument();
    expect(screen.queryByText('Shared contexts')).not.toBeInTheDocument();
    unmount();

    mocks.modules = [{
      uri        : contextsModule,
      published  : true,
      definition : createCanonicalContextCompanionDefinition(contextsModule),
    }];
    renderWithProviders(<PermissionsTab did="did:dht:owner" />);
    const row = screen.getByRole('listitem', { name: 'Notes Shared contexts' });
    expect(within(row).getByText('Shared contexts')).toBeInTheDocument();
  });

  it('tags module access that is not a built-in definition as third-party', () => {
    mocks.permissions = [
      permissionGrant({ id: 'profile-read', session: activeSession }),
      permissionGrant({ id: 'notes-read', session: activeSession, module: notesModule }),
    ];

    renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    const access = screen.getByRole('list', { name: 'Example Notes data access' });
    expect(within(within(access).getByRole('listitem', { name: 'Notes' })).getByText('Third-party')).toBeInTheDocument();
    expect(within(within(access).getByRole('listitem', { name: 'Profile' })).queryByText('Third-party')).not.toBeInTheDocument();
  });

  it('offers no revoke for direct grants that already expired', () => {
    mocks.permissions = [{
      id          : 'direct-expired',
      grantee     : 'did:dht:service',
      dateGranted : '2025-01-01T00:00:00.000Z',
      dateExpires : '2025-02-01T00:00:00.000Z',
      scope       : { interface: 'Records', method: 'Read', module: notesModule },
    } as DwnPermissionGrant, {
      id          : 'direct-active',
      grantee     : 'did:dht:service',
      dateGranted : '2025-01-01T00:00:00.000Z',
      dateExpires : '2099-02-01T00:00:00.000Z',
      scope       : { interface: 'Records', method: 'Read', module: 'https://identity.foundation/modules/profile' },
    } as DwnPermissionGrant];

    renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    expect(screen.queryByRole('button', { name: 'Revoke Notes permission' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke Profile permission' })).toBeInTheDocument();
  });

  it('revokes every scope of one module row after confirmation', async () => {
    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    await user.click(screen.getByRole('button', { name: 'Revoke Example Notes access to Profile' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Remove Profile access?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove access' }));

    await waitFor(() => expect(mocks.createRevocation).toHaveBeenCalledTimes(2));
    expect(mocks.createRevocation.mock.calls.map(([params]) => params.grant.id).sort())
      .toEqual(['grant-1', 'grant-2']);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Permission revoked');
  });

  it('disconnects an app across its active devices', async () => {
    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    await user.click(screen.getByRole('button', { name: 'Disconnect Example Notes' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(mocks.createRevocation).toHaveBeenCalledTimes(2));
    expect(mocks.createRevocation.mock.calls.map(([params]) => params.grant.id))
      .not.toContain('grant-3');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Example Notes disconnected');
  });

  it('renews an expired session after confirmation', async () => {
    const { user, queryClient } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(screen.getByRole('button', {
      name: 'Renew Firefox on Linux session for Example Notes',
    }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/for another 7 days/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Renew access' }));

    await waitFor(() => {
      expect(mocks.renewExpiredSession).toHaveBeenCalledTimes(1);
    });
    const [, ownerDid, session] = mocks.renewExpiredSession.mock.calls[0];
    expect(ownerDid).toBe('did:dht:owner');
    expect(session.grantee).toBe('did:dht:expired-delegate');
    expect(session.grants.map((grant: DwnPermissionGrant) => grant.id)).toEqual(['grant-3']);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      expect.stringContaining('Example Notes access renewed'),
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.permissions('did:dht:owner'),
    });
  });

  it('reports a renewal failure without dismissing the dialog target', async () => {
    mocks.renewExpiredSession.mockRejectedValue(new Error('renewal failed'));

    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    await user.click(screen.getByRole('button', {
      name: 'Renew Firefox on Linux session for Example Notes',
    }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Renew access' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('renewal failed');
    });
  });

  it('renders apps whose sessions all expired with compact renewable rows', () => {
    mocks.permissions = [
      permissionGrant({
        id      : 'grant-expired',
        session : expiredSession,
        grantee : 'did:dht:expired-delegate',
      }),
    ];

    renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    expect(screen.queryByRole('heading', { name: 'Connected apps' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Past connections' })).toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: 'Renew Firefox on Linux session for Example Notes',
    })).toBeInTheDocument();
  });

  it('bounds expired session rows per app with an expander', async () => {
    mocks.permissions = Array.from({ length: 5 }, (_, index) =>
      permissionGrant({
        id      : `grant-expired-${index}`,
        session : {
          ...expiredSession,
          id        : `expired-session-${index}`,
          createdAt : `2025-01-0${index + 2}T00:00:00.000Z`,
          expiresAt : `2025-01-0${index + 3}T00:00:00.000Z`,
        },
        grantee: `did:dht:expired-delegate-${index}`,
      }));

    const { user } = renderWithProviders(<PermissionsTab did="did:dht:owner" />);

    const devices = screen.getByRole('list', { name: 'Devices for Example Notes' });
    expect(within(devices).getAllByRole('listitem', { name: 'Firefox on Linux' })).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Show all 5 expired sessions' }));
    expect(within(devices).getAllByRole('listitem', { name: 'Firefox on Linux' })).toHaveLength(5);

    await user.click(screen.getByRole('button', { name: 'Show fewer expired sessions' }));
    expect(within(devices).getAllByRole('listitem', { name: 'Firefox on Linux' })).toHaveLength(3);
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

    expect(within(application).getByText('1 device connected')).toBeInTheDocument();
    expect(within(application).getByText('Last renewed')).toBeInTheDocument();
    expect(within(application).getAllByRole('listitem', { name: /^Approval on /, hidden: true })).toHaveLength(3);

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
