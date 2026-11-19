import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import {
  createMockIdentity,
  createMockProfile,
  createMockModule,
  createMockPermission,
} from '@/__mocks__/enbox-mocks';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const testDid = 'did:dht:testidentity123';

const mockIdentity = createMockIdentity({ did: testDid, name: 'My Identity' });

const mockProfile = createMockProfile({
  did: testDid,
  displayName: 'Test User',
  tagline: 'Hello world',
  bio: 'A test bio',
});

const mockModules = [
  createMockModule({ uri: 'https://identity.foundation/modules/profile' }),
  createMockModule({ uri: 'https://identity.foundation/modules/connect' }),
  createMockModule({ uri: 'https://enbox.id/modules/notes/v1' }),
];

const mockPermissions = [
  {
    ...createMockPermission({
    grantee: 'did:dht:app1',
    module: 'https://identity.foundation/modules/profile',
    }),
    dateGranted    : '2026-06-23T00:00:00.000Z',
    dateExpires    : '2099-06-24T00:00:00.000Z',
    connectSession : {
      id        : 'session-1',
      createdAt : '2026-06-23T00:00:00.000Z',
      expiresAt : '2099-06-24T00:00:00.000Z',
      appName   : 'Example App',
      origin    : 'https://app.example',
      userAgent : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      platform  : 'MacIntel',
      language  : 'en-US',
      timezone  : 'America/New_York',
      transport : 'postMessage' as const,
    },
  },
  // A second grant for the same app (new session, new delegate DID) must not
  // increase the tab's app count.
  {
    ...createMockPermission({
    id      : 'grant-456',
    grantee : 'did:dht:delegate-two',
    }),
    dateGranted    : '2026-06-24T00:00:00.000Z',
    dateExpires    : '2099-06-25T00:00:00.000Z',
    connectSession : {
      id        : 'session-2',
      createdAt : '2026-06-24T00:00:00.000Z',
      expiresAt : '2099-06-25T00:00:00.000Z',
      appName   : 'Example App',
      origin    : 'https://app.example',
      transport : 'postMessage' as const,
    },
  },
];

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useParams: () => ({ did: encodeURIComponent(testDid) }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data: [mockIdentity],
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-profile', () => ({
  useProfile: () => ({
    data: mockProfile,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-modules', () => ({
  useModules: () => ({
    data: mockModules,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: () => ({
    data: mockPermissions,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useDeleteIdentity: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExportIdentity: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/enbox/hooks/use-agent', () => {
  const agent = {
    agentDid: { uri: 'did:dht:agent' },
    sync    : {
      getIdentitySyncStatus: vi.fn(async () => ({
        registration : undefined,
        health       : {
          connectivity            : 'unknown',
          failedMessageCount      : 0,
          degradedLinkCount       : 0,
          quotaBlockedMessageCount: 0,
          syncHealthy             : true,
        },
        connectivity : 'unknown',
        currentness  : 'syncing',
        remotes      : [],
        links        : [],
      })),
      on             : vi.fn(() => () => {}),
      retryRemoteNow : vi.fn(async () => undefined),
    },
  };

  return { useAgent: () => agent };
});

// QRCodeCanvas from qrcode.react uses canvas APIs not available in happy-dom
vi.mock('qrcode.react', () => ({
  QRCodeCanvas: () => null,
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import IdentityDetailsPage from '../IdentityDetailsPage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdentityDetailsPage', () => {
  const route = `/identity/${encodeURIComponent(testDid)}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders identity display name as heading', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // The display name appears in both h1 (page header) and h2 (overview tab).
    // Verify the primary h1 heading exists.
    const headings = screen.getAllByRole('heading', { name: /test user/i });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings[0].tagName).toBe('H1');
  });

  it('renders persona badge', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    expect(screen.getByText('My Identity')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // The Share button has title="Share DID"
    expect(
      screen.getByRole('button', { name: /share/i }),
    ).toBeInTheDocument();
  });

  it('renders all tab headers', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });

    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /modules/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /wallets/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });

  it('renders module count in tab label', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // With 3 modules, the label should be "Modules (3)"
    expect(screen.getByRole('tab', { name: /modules \(3\)/i })).toBeInTheDocument();
  });

  it('renders app count in tab label', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // 2 grants across 2 sessions, but both belong to the same app (same
    // verified origin), so the label should be "Apps & Permissions (1)".
    expect(screen.getByRole('tab', { name: /apps & permissions \(1\)/i })).toBeInTheDocument();
  });

  it('shows overview tab content by default', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // Overview tab shows profile bio
    expect(screen.getByText('A test bio')).toBeInTheDocument();
  });

  it('words each overview count for its number', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });

    // One connected app reads "1 App", never "1 Apps".
    expect(screen.getByRole('button', { name: /^1\s*App with access$/ })).toBeInTheDocument();
    expect(screen.queryByText('Apps with access')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^3\s*Modules$/ })).toBeInTheDocument();
  });

  it('opens the tab an overview count comes from', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });

    await user.click(screen.getByRole('button', { name: /^3\s*Modules$/ }));
    expect(screen.getByRole('tab', { name: /modules/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Core modules' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /overview/i }));
    await user.click(screen.getByRole('button', { name: /App with access$/ }));
    expect(screen.getByRole('tab', { name: /apps & permissions/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('pins the tab bar and offers a way back to the profile list', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });

    const bar = screen.getByTestId('profile-tab-bar');
    expect(bar).toHaveClass('sticky');
    expect(within(bar).getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to profiles' })).toHaveAttribute('href', '/');
  });

  it('switches to modules tab when clicked', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    await user.click(screen.getByRole('tab', { name: /modules/i }));

    // Should show module human-friendly names (catalog data, not UI copy)
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    // Anything that isn't a built-in definition is grouped as third-party.
    const thirdParty = screen.getByRole('region', { name: 'Third-party modules' });
    expect(within(thirdParty).getByText('Notes')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Core modules' })).queryByText('Notes')).not.toBeInTheDocument();
  });

  it('switches to permissions tab and shows grantee', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    await user.click(screen.getByRole('tab', { name: /permissions/i }));

    // Should show the grantee DID (truncated — contains "app1")
    expect(screen.getByText(/app1/)).toBeInTheDocument();
  });

  it('shows connect session metadata on the permissions tab', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    await user.click(screen.getByRole('tab', { name: /permissions/i }));

    expect(screen.getByText('Connected apps')).toBeInTheDocument();
    expect(screen.getByText('Example App')).toBeInTheDocument();
    expect(screen.getByText('Safari on macOS')).toBeInTheDocument();
    expect(screen.getAllByText('America/New_York').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Browser popup').length).toBeGreaterThanOrEqual(1);
  });


  it('supports keyboard tab navigation with ArrowRight', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    // Focus on the overview tab
    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    overviewTab.focus();

    // ArrowRight should move to the next tab (Apps & Permissions)
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /apps & permissions/i })).toHaveFocus();
  });

  it('orders tabs by day-to-day use, setup details last', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.replace(/\d+\(\d+\)$/, '').trim())).toEqual([
      'Overview', 'Apps & Permissions', 'Activity', 'Modules', 'Wallets',
    ]);
  });

  it('shows delete and export buttons', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });

    // Delete button has danger variant
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);

    // Export button
    const exportButtons = screen.getAllByRole('button', { name: /export/i });
    expect(exportButtons.length).toBeGreaterThanOrEqual(1);
  });
});
