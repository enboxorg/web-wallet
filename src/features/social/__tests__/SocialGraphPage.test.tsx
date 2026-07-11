import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';

const mocks = vi.hoisted(() => {
  const identities = [
    {
      did: { uri: 'did:dht:alice111' },
      metadata: { name: 'Personal' },
    },
    {
      did: { uri: 'did:dht:bob222' },
      metadata: { name: 'Work' },
    },
  ];

  return {
    identities,
    identitiesResult: {
      data: identities,
      isLoading: false,
      error: null as Error | null,
    },
    profiles: {
      'did:dht:alice111': {
        did: 'did:dht:alice111',
        displayName: 'Alice',
        tagline: 'Builder',
        avatarUrl: null,
      },
      'did:dht:bob222': {
        did: 'did:dht:bob222',
        displayName: 'Bob Work',
        tagline: 'Developer',
        avatarUrl: null,
      },
    } as Record<string, any>,
    graphs: {
      'did:dht:alice111': {
        friends: [
          {
            id: 'friend-alice',
            did: 'did:dht:friendalice',
            alias: 'Alice Friend',
            note: 'Trusted contact',
          },
        ],
        groups: [
          {
            id: 'group-alice',
            contextId: 'group-alice-context',
            name: 'Alice Group',
            members: [],
          },
        ],
        blocks: [],
      },
      'did:dht:bob222': {
        friends: [
          {
            id: 'friend-bob',
            did: 'did:dht:friendbob',
            alias: 'Bob Friend',
          },
        ],
        groups: [],
        blocks: [
          {
            id: 'block-bob',
            did: 'did:dht:blockedbob',
            reason: 'Spam',
          },
        ],
      },
    } as Record<string, any>,
  };
});

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => mocks.identitiesResult,
}));

vi.mock('@/enbox/hooks/use-profile', () => ({
  useProfile: (did: string) => ({
    data: mocks.profiles[did] ?? null,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-social-graph', () => ({
  useSocialGraph: (did: string) => ({
    data: mocks.graphs[did] ?? { friends: [], groups: [], blocks: [] },
    isLoading: false,
    isError: false,
    error: null,
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

import SocialGraphPage from '../SocialGraphPage';

describe('SocialGraphPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identitiesResult.data = mocks.identities;
    mocks.identitiesResult.isLoading = false;
    mocks.identitiesResult.error = null;
  });

  it('renders wallet-level social graph management for the first identity', () => {
    renderWithProviders(<SocialGraphPage />, { initialRoute: '/social' });
    const identitySelector = within(screen.getByLabelText('Social graph profile'));

    expect(screen.getByRole('heading', { level: 1, name: 'Connections' })).toBeInTheDocument();
    expect(identitySelector.getByRole('button', { name: /alice/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Alice Friend')).toBeInTheDocument();
    expect(screen.getByText('Alice Group')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add friend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^block did$/i })).toBeInTheDocument();
  });

  it('switches the managed identity', async () => {
    const { user } = renderWithProviders(<SocialGraphPage />, { initialRoute: '/social' });
    const identitySelector = within(screen.getByLabelText('Social graph profile'));

    await user.click(identitySelector.getByRole('button', { name: /bob work/i }));

    expect(identitySelector.getByRole('button', { name: /bob work/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Bob Friend')).toBeInTheDocument();
    expect(screen.getByText('Spam')).toBeInTheDocument();
    expect(screen.queryByText('Alice Friend')).not.toBeInTheDocument();
  });

  it('shows an identity creation call to action when the wallet has no identities', () => {
    mocks.identitiesResult.data = [];

    renderWithProviders(<SocialGraphPage />, { initialRoute: '/social' });

    expect(screen.getByRole('heading', { level: 1, name: 'Connections' })).toBeInTheDocument();
    expect(screen.getByText('No profiles yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new profile/i })).toHaveAttribute(
      'href',
      '/identities/create',
    );
  });
});
