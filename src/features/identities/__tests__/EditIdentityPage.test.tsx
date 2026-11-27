import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import { createMockIdentity, createMockProfile } from '@/__mocks__/enbox-mocks';
import { renderWithProviders } from '@/test-utils';

const testDid = 'did:dht:editable123';

const mocks = vi.hoisted(() => ({
  activeDid       : 'did:dht:editable123',
  updateProfile   : vi.fn(),
  updateEndpoints : vi.fn(),
  navigate        : vi.fn(),
  identities      : [] as any[],
  profile         : undefined as any,
  endpoints       : ['https://dwn.example'] as string[],
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useParams: () => ({ did: encodeURIComponent(mocks.activeDid) }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data: mocks.identities,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-profile', () => ({
  useProfile: () => ({
    data: mocks.profile,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-dwn-endpoints', () => ({
  useDwnEndpoints: () => ({
    data: mocks.endpoints,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useUpdateIdentityProfile: () => ({
    mutateAsync: mocks.updateProfile,
    isPending: false,
  }),
  useUpdateDwnEndpoints: () => ({
    mutateAsync: mocks.updateEndpoints,
    isPending: false,
  }),
}));

vi.mock('@/components/ui/EndpointHealth', () => ({
  EndpointHealth: ({ url }: { url: string }) => <span>{url}</span>,
}));

import EditIdentityPage from '../EditIdentityPage';

describe('EditIdentityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeDid = testDid;
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.updateEndpoints.mockResolvedValue(undefined);
    mocks.identities = [createMockIdentity({ did: testDid, name: 'Personal' })];
    mocks.profile = createMockProfile({
      did: testDid,
      displayName: 'Editable User',
      tagline: 'Original tagline',
      bio: 'Original bio',
    });
    mocks.endpoints = ['https://dwn.example'];
  });

  it('renders inside the app MemoryRouter without a data-router blocker', () => {
    renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    expect(screen.getByRole('heading', { name: /edit profile/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Editable User')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('persists persona changes when edited and trims whitespace', async () => {
    renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    fireEvent.change(screen.getByLabelText(/persona/i), {
      target: { value: '  Work  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        did         : testDid,
        persona     : 'Work',
        displayName : 'Editable User',
        tagline     : 'Original tagline',
        bio         : 'Original bio',
        avatar      : undefined,
        hero        : undefined,
      });
    });
  });

  it('omits persona on save when unchanged or blank to avoid no-op metadata errors', async () => {
    renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Renamed User' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        did         : testDid,
        displayName : 'Renamed User',
        tagline     : 'Original tagline',
        bio         : 'Original bio',
        avatar      : undefined,
        hero        : undefined,
      });
    });
    expect(mocks.updateProfile.mock.calls[0][0]).not.toHaveProperty('persona');
  });

  it('does not overwrite unsaved form edits when background sync refetches profile or identity data', () => {
    const view = renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Draft Name' },
    });
    fireEvent.change(screen.getByLabelText(/persona/i), {
      target: { value: 'Draft Persona' },
    });
    fireEvent.change(screen.getByLabelText(/tagline/i), {
      target: { value: 'Draft Tagline' },
    });
    fireEvent.change(screen.getByLabelText(/bio/i), {
      target: { value: 'Draft Bio' },
    });

    // Simulate background query invalidation returning fresh object references.
    mocks.identities = [createMockIdentity({ did: testDid, name: 'Personal' })];
    mocks.profile = createMockProfile({
      did: testDid,
      displayName: 'Editable User',
      tagline: 'Original tagline',
      bio: 'Original bio',
    });
    view.rerender(<EditIdentityPage />);

    expect(screen.getByLabelText(/display name/i)).toHaveValue('Draft Name');
    expect(screen.getByLabelText(/persona/i)).toHaveValue('Draft Persona');
    expect(screen.getByLabelText(/tagline/i)).toHaveValue('Draft Tagline');
    expect(screen.getByLabelText(/bio/i)).toHaveValue('Draft Bio');
  });

  it('hydrates untouched fields when profile sync finishes without clobbering edited persona', () => {
    mocks.profile = createMockProfile({
      did: testDid,
      displayName: '',
      tagline: undefined,
      bio: undefined,
      hasProfileRecord: false,
    });
    const view = renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    fireEvent.change(screen.getByLabelText(/persona/i), {
      target: { value: 'Work' },
    });

    mocks.profile = createMockProfile({
      did: testDid,
      displayName: 'Synced Name',
      tagline: 'Synced Tagline',
      bio: 'Synced Bio',
      hasProfileRecord: true,
    });
    view.rerender(<EditIdentityPage />);

    expect(screen.getByLabelText(/persona/i)).toHaveValue('Work');
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Synced Name');
    expect(screen.getByLabelText(/tagline/i)).toHaveValue('Synced Tagline');
    expect(screen.getByLabelText(/bio/i)).toHaveValue('Synced Bio');
  });

  it('blocks saving with an inline error when clearing an existing persona and resets drafts on DID switch', async () => {
    const view = renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    fireEvent.change(screen.getByLabelText(/persona/i), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Persona name cannot be empty.')).toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();

    const otherDid = 'did:dht:second456';
    mocks.activeDid = otherDid;
    mocks.identities = [
      createMockIdentity({ did: testDid, name: 'Personal' }),
      createMockIdentity({ did: otherDid, name: 'Gaming' }),
    ];
    mocks.profile = createMockProfile({
      did: otherDid,
      displayName: 'Second User',
      tagline: 'Second tagline',
      bio: 'Second bio',
    });
    view.rerender(<EditIdentityPage />);

    expect(screen.getByLabelText(/persona/i)).toHaveValue('Gaming');
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Second User');
    expect(screen.queryByText('Persona name cannot be empty.')).not.toBeInTheDocument();
  });

  it('clears profile drafts after profile save so retrying a failed endpoint update does not re-save profile', async () => {
    mocks.updateProfile.mockImplementationOnce(async () => {
      mocks.profile = createMockProfile({
        ...mocks.profile,
        displayName: 'Updated Name',
      });
    });
    mocks.updateEndpoints
      .mockRejectedValueOnce(new Error('DHT publish failed'))
      .mockResolvedValueOnce(undefined);

    const view = renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    fireEvent.change(screen.getByLabelText(/display name/i), {
      target: { value: 'Updated Name' },
    });
    const endpointInput = screen.getByLabelText(/dwn endpoints/i);
    fireEvent.change(endpointInput, { target: { value: 'https://dwn2.example' } });
    fireEvent.keyDown(endpointInput, { key: 'Enter' });

    // First submit: profile succeeds (updating cached profile before resolving), endpoints fail.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.updateEndpoints).toHaveBeenCalledTimes(1));
    view.rerender(<EditIdentityPage />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Updated Name');

    // Retry submit: only updateEndpoints runs; updateProfile is not called a second time.
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mocks.updateEndpoints).toHaveBeenCalledTimes(2));
    expect(mocks.updateProfile).toHaveBeenCalledTimes(1);
  });
});
