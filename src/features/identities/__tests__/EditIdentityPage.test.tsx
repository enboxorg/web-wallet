import { beforeEach, describe, expect, it, vi } from 'vitest';

import { screen } from '@testing-library/react';

import { createMockIdentity, createMockProfile } from '@/__mocks__/enbox-mocks';
import { renderWithProviders } from '@/test-utils';

const testDid = 'did:dht:editable123';
const mockIdentity = createMockIdentity({ did: testDid, name: 'Personal' });
const mockProfile = createMockProfile({
  did: testDid,
  displayName: 'Editable User',
  tagline: 'Original tagline',
  bio: 'Original bio',
});

const mutationMocks = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  updateEndpoints: vi.fn(),
}));

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

vi.mock('@/enbox/hooks/use-dwn-endpoints', () => ({
  useDwnEndpoints: () => ({
    data: ['https://dwn.example'],
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useUpdateIdentityProfile: () => ({
    mutateAsync: mutationMocks.updateProfile,
    isPending: false,
  }),
  useUpdateDwnEndpoints: () => ({
    mutateAsync: mutationMocks.updateEndpoints,
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
  });

  it('renders inside the app MemoryRouter without a data-router blocker', () => {
    renderWithProviders(<EditIdentityPage />, {
      initialRoute: `/identity/${encodeURIComponent(testDid)}/edit`,
    });

    expect(screen.getByRole('heading', { name: /edit identity/i })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Editable User')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });
});
