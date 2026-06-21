import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import {
  createMockIdentity,
  createMockProfile,
  createMockProtocol,
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

const mockProtocols = [
  createMockProtocol({ uri: 'https://identity.foundation/protocols/profile' }),
  createMockProtocol({ uri: 'https://identity.foundation/protocols/social-graph' }),
];

const mockPermissions = [
  createMockPermission({
    grantee: 'did:dht:app1',
    protocol: 'https://identity.foundation/protocols/profile',
  }),
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

vi.mock('@/enbox/hooks/use-protocols', () => ({
  useProtocols: () => ({
    data: mockProtocols,
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

vi.mock('@/enbox/hooks/use-social-graph', () => ({
  useSocialGraph: () => ({
    data: {
      friends: [
        {
          id: 'friend-1',
          did: 'did:dht:friend1',
          alias: 'Friend One',
          note: 'Trusted contact',
          recipient: 'did:dht:friend1',
        },
      ],
      groups: [
        {
          id: 'group-1',
          contextId: 'group-context',
          name: 'Builders',
          members: [
            {
              id: 'member-1',
              did: 'did:dht:friend1',
              alias: 'Friend One',
            },
          ],
        },
      ],
      blocks: [],
    },
    isLoading: false,
    isError: false,
  }),
  useAddSocialFriend: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveSocialFriend: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateSocialGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteSocialGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddSocialGroupMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveSocialGroupMember: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBlockSocialDid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnblockSocialDid: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/enbox/hooks/use-agent', () => ({
  useAgent: () => ({ agentDid: { uri: 'did:dht:agent' } }),
}));

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
    expect(screen.getByRole('tab', { name: /protocols/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /wallets/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /social/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /permissions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /activity/i })).toBeInTheDocument();
  });

  it('renders protocol count in tab label', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // With 2 protocols, the label should be "Protocols (2)"
    expect(screen.getByRole('tab', { name: /protocols \(2\)/i })).toBeInTheDocument();
  });

  it('renders permission count in tab label', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // With 1 permission, the label should be "Permissions (1)"
    expect(screen.getByRole('tab', { name: /permissions \(1\)/i })).toBeInTheDocument();
  });

  it('shows overview tab content by default', () => {
    renderWithProviders(<IdentityDetailsPage />, { initialRoute: route });
    // Overview tab shows profile bio
    expect(screen.getByText('A test bio')).toBeInTheDocument();
  });

  it('switches to protocols tab when clicked', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    await user.click(screen.getByRole('tab', { name: /protocols/i }));

    // Should show protocol human-friendly names
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByText('Social Graph')).toBeInTheDocument();
  });

  it('switches to permissions tab and shows grantee', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    await user.click(screen.getByRole('tab', { name: /permissions/i }));

    // Should show the grantee DID (truncated — contains "app1")
    expect(screen.getByText(/app1/)).toBeInTheDocument();
  });

  it('switches to social tab and shows social graph records', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    await user.click(screen.getByRole('tab', { name: /social/i }));

    expect(screen.getAllByText('Friend One').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Builders')).toBeInTheDocument();
  });

  it('supports keyboard tab navigation with ArrowRight', async () => {
    const { user } = renderWithProviders(<IdentityDetailsPage />, {
      initialRoute: route,
    });

    // Focus on the overview tab
    const overviewTab = screen.getByRole('tab', { name: /overview/i });
    overviewTab.focus();

    // ArrowRight should move to the next tab (Protocols)
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /protocols/i })).toHaveFocus();
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
