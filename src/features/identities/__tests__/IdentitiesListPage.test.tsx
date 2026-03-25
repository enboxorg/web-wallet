import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { createMockIdentity, createMockProfile } from '@/__mocks__/enbox-mocks';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockIdentities = [
  createMockIdentity({ did: 'did:dht:alice111', name: 'Personal' }),
  createMockIdentity({ did: 'did:dht:bob222', name: 'Work' }),
];

const mockProfiles: Record<string, ReturnType<typeof createMockProfile>> = {
  'did:dht:alice111': createMockProfile({
    did: 'did:dht:alice111',
    displayName: 'Alice',
    tagline: 'Builder',
  }),
  'did:dht:bob222': createMockProfile({
    did: 'did:dht:bob222',
    displayName: 'Bob Work',
    tagline: 'Developer',
  }),
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data: mockIdentities,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/enbox/hooks/use-profile', () => ({
  useProfile: (did: string) => ({
    data: mockProfiles[did] ?? null,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: () => ({ data: [], isLoading: false }),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import IdentitiesListPage from '../IdentitiesListPage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdentitiesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', () => {
    renderWithProviders(<IdentitiesListPage />);
    expect(
      screen.getByRole('heading', { name: /identities/i }),
    ).toBeInTheDocument();
  });

  it('renders identity cards with display names from profiles', () => {
    renderWithProviders(<IdentitiesListPage />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob Work')).toBeInTheDocument();
  });

  it('renders taglines from profiles', () => {
    renderWithProviders(<IdentitiesListPage />);
    expect(screen.getByText('Builder')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();
  });

  it('renders a create identity link', () => {
    renderWithProviders(<IdentitiesListPage />);
    // The "Create Identity" text is inside a <Link> wrapping a <Button>
    expect(screen.getByRole('link', { name: /create identity/i })).toBeInTheDocument();
  });

  it('shows a search input when identities exist', () => {
    renderWithProviders(<IdentitiesListPage />);
    expect(
      screen.getByPlaceholderText(/search by name, persona, or did/i),
    ).toBeInTheDocument();
  });

  it('filters identities by persona name when typing in search', async () => {
    // Search filters on identity.metadata.name (persona) and DID, not
    // profile displayName — so we search for the persona "Personal"
    const { user } = renderWithProviders(<IdentitiesListPage />);
    const searchInput = screen.getByPlaceholderText(/search/i);

    await user.type(searchInput, 'Personal');

    // "Personal" persona is alice → Alice card visible
    expect(screen.getByText('Alice')).toBeInTheDocument();
    // "Work" persona is bob → Bob card hidden
    expect(screen.queryByText('Bob Work')).not.toBeInTheDocument();
  });

  it('shows empty state when search matches nothing', async () => {
    const { user } = renderWithProviders(<IdentitiesListPage />);
    const searchInput = screen.getByPlaceholderText(/search/i);

    await user.type(searchInput, 'zzzznonexistent');

    expect(
      screen.getByText(/no identities match/i),
    ).toBeInTheDocument();
  });

  it('clears search and shows all identities again', async () => {
    const { user } = renderWithProviders(<IdentitiesListPage />);
    const searchInput = screen.getByPlaceholderText(/search/i);

    await user.type(searchInput, 'Personal');
    expect(screen.queryByText('Bob Work')).not.toBeInTheDocument();

    await user.clear(searchInput);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob Work')).toBeInTheDocument();
  });

  it('filters identities by DID substring', async () => {
    const { user } = renderWithProviders(<IdentitiesListPage />);
    const searchInput = screen.getByPlaceholderText(/search/i);

    await user.type(searchInput, 'bob222');

    expect(screen.getByText('Bob Work')).toBeInTheDocument();
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });
});
