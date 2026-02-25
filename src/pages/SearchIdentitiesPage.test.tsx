import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Hoisted mocks ────────────────────────────────────────────────────────

const { mockRecordsQuery } = vi.hoisted(() => ({
  mockRecordsQuery: vi.fn(),
}));

vi.mock('@enbox/api', () => ({
  Web5: {
    anonymous: vi.fn().mockReturnValue({
      dwn: {
        records: {
          query: mockRecordsQuery,
        },
      },
    }),
  },
}));

vi.mock('@enbox/protocols', () => ({
  ProfileDefinition: {
    protocol: 'https://identity.foundation/protocols/profile',
  },
}));

vi.mock('@enbox/dids', () => ({
  Did: {
    parse: vi.fn().mockImplementation((uri: string) => {
      if (uri.startsWith('did:')) {
        return { uri, method: uri.split(':')[1] };
      }
      return null;
    }),
  },
}));

vi.mock('@/lib/utils', () => ({
  truncateDid: vi.fn().mockImplementation((did: string) => did.substring(0, 20) + '...'),
}));

vi.mock('@/components/identity/PublicIdentityCard', () => ({
  default: ({ identity }: any) => (
    <div data-testid="identity-card">
      <span data-testid="card-did">{identity.didUri}</span>
      <span data-testid="card-display-name">{identity.profile?.social?.displayName ?? 'none'}</span>
    </div>
  ),
}));

vi.mock('@mui/icons-material', () => ({
  Search: () => <span data-testid="search-icon">search</span>,
}));

import SearchIdentitiesPage from './SearchIdentitiesPage';

// ── Helpers ──────────────────────────────────────────────────────────────

const renderWithRouter = (initialEntry: string = '/search') => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/search" element={<SearchIdentitiesPage />} />
        <Route path="/search/:didUri" element={<SearchIdentitiesPage />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe('SearchIdentitiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the search form', () => {
    renderWithRouter();
    const input = screen.getByPlaceholderText(/Enter a DID/i);
    expect(input).toBeInTheDocument();
  });

  it('should render "Search" as the title when no DID is entered', () => {
    renderWithRouter();
    expect(screen.getByText('Search')).toBeInTheDocument();
  });

  it('should search and display a DID from URL parameter', async () => {
    mockRecordsQuery.mockResolvedValue({
      records: [{
        data: { json: vi.fn().mockResolvedValue({ displayName: 'Alice', bio: 'Hello' }) },
      }],
    });

    renderWithRouter('/search/did:dht:alicetest123');

    await waitFor(() => {
      expect(screen.getByTestId('identity-card')).toBeInTheDocument();
    });

    expect(screen.getByTestId('card-did')).toHaveTextContent('did:dht:alicetest123');
  });

  it('should fetch profile data using Web5.anonymous() on search', async () => {
    mockRecordsQuery
      .mockResolvedValueOnce({
        records: [{
          data: { json: vi.fn().mockResolvedValue({ displayName: 'Bob' }) },
        }],
      })
      .mockResolvedValueOnce({ records: [] })  // avatar
      .mockResolvedValueOnce({ records: [] }); // hero

    renderWithRouter('/search/did:dht:bobtest456');

    await waitFor(() => {
      expect(mockRecordsQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          from   : 'did:dht:bobtest456',
          filter : expect.objectContaining({
            protocol     : 'https://identity.foundation/protocols/profile',
            protocolPath : 'profile',
          }),
        }),
      );
    });
  });

  it('should submit the search form with a valid DID', async () => {
    mockRecordsQuery.mockResolvedValue({ records: [] });

    renderWithRouter();

    const input = screen.getByPlaceholderText(/Enter a DID/i);
    fireEvent.change(input, { target: { value: 'did:dht:searchtest789' } });

    const form = input.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId('identity-card')).toBeInTheDocument();
    });
  });

  it('should handle query errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRecordsQuery.mockRejectedValue(new Error('Network failure'));

    renderWithRouter('/search/did:dht:errortest');

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByTestId('identity-card')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('should show "Search Result" heading when a DID is active', async () => {
    mockRecordsQuery.mockResolvedValue({ records: [] });

    renderWithRouter('/search/did:dht:test');

    await waitFor(() => {
      expect(screen.getByText('Search Result')).toBeInTheDocument();
    });
  });
});
