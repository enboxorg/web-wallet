import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';

const mocks = vi.hoisted(() => {
  const refreshIdentityRouting = vi.fn();
  return {
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
    getVaultSummary: vi.fn(),
    claimAndStoreInvite: vi.fn(),
    refreshMintCredits: vi.fn(),
    redeemStorageBlockForDid: vi.fn(),
    fetchMintConfig: vi.fn(),
    previewInvite: vi.fn(),
    fetchEndpointBlindTokenInfo: vi.fn(),
    fetchEndpointQuota: vi.fn(),
    refreshIdentityRouting,
    mockAgent: {
      agentDid: { uri: 'did:dht:agent' },
      secrets: { get: vi.fn(), put: vi.fn() },
      sync: { refreshIdentityRouting },
    },
    identitiesResult: {
      isLoading: false,
      data: [
        {
          did: { uri: 'did:dht:alice00000000000000000000000000' },
          metadata: { name: 'Personal' },
        },
      ],
    },
    endpointsResult: {
      isLoading: false,
      data: ['https://cf-east.dwn.enbox.id'],
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/enbox/hooks/use-agent', () => ({
  useAgent: () => mocks.mockAgent,
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => mocks.identitiesResult,
}));

vi.mock('@/enbox/hooks/use-dwn-endpoints', () => ({
  useDwnEndpoints: () => mocks.endpointsResult,
}));

vi.mock('@/enbox/blind-token-vault', () => ({
  getVaultSummary: mocks.getVaultSummary,
  claimAndStoreInvite: mocks.claimAndStoreInvite,
  refreshMintCredits: mocks.refreshMintCredits,
  redeemStorageBlockForDid: mocks.redeemStorageBlockForDid,
}));

vi.mock('@/lib/blind-tokens', async () => {
  const actual = await vi.importActual<typeof import('@/lib/blind-tokens')>('@/lib/blind-tokens');
  return {
    ...actual,
    fetchMintConfig: mocks.fetchMintConfig,
    previewInvite: mocks.previewInvite,
    fetchEndpointBlindTokenInfo: mocks.fetchEndpointBlindTokenInfo,
    fetchEndpointQuota: mocks.fetchEndpointQuota,
  };
});

import CreditsPage from '../CreditsPage';

const sampleDescriptor = {
  audience: 'dwn-cf-east',
  issuerUrls: ['https://mint.enbox.id'],
  units: [{ unit: 'storage-50mb-1yr', bytes: 50 * 1024 * 1024, durationSeconds: 31_536_000 }],
  registrationUrl: 'https://cf-east.dwn.enbox.id/registration',
  quotaUrl: 'https://cf-east.dwn.enbox.id/registration/quota',
};

describe('CreditsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshIdentityRouting.mockResolvedValue(undefined);
    mocks.getVaultSummary.mockResolvedValue({
      mintUrl: 'https://mint.enbox.id',
      totalCredits: 5,
      mintTokenCount: 2,
      expiredMintTokenCount: 0,
      denominations: [
        { unit: 'c4', count: 1, creditsPerToken: 4, totalCredits: 4 },
        { unit: 'c1', count: 1, creditsPerToken: 1, totalCredits: 1 },
      ],
      serviceTokenCounts: {},
      totalServiceTokenCount: 0,
    });
    mocks.fetchMintConfig.mockResolvedValue({
      version: 1,
      issuer: 'https://mint.enbox.id',
      suite: 'RSABSSA-SHA384-PSS-Randomized',
      creditValueUsdCents: 25,
      mintDenominations: [
        { unit: 'c1', credits: 1 },
        { unit: 'c4', credits: 4 },
      ],
      tariffs: [{ aud: 'dwn-cf-east', unit: 'storage-50mb-1yr', credits: 1 }],
      currentEpoch: '2026-Q4',
      keys: [
        {
          kty: 'RSA',
          n: 'n',
          e: 'AQAB',
          alg: 'PS384',
          use: 'sig',
          kid: 'dwn-cf-east:storage-50mb-1yr:2026-Q4',
          aud: 'dwn-cf-east',
          unit: 'storage-50mb-1yr',
          epoch: '2026-Q4',
          notAfter: '2027-01-01T00:00:00.000Z',
          redeemBefore: '2028-01-01T00:00:00.000Z',
          active: true,
        },
      ],
      issuedAt: '2026-10-01T00:00:00.000Z',
    });
    mocks.fetchEndpointBlindTokenInfo.mockResolvedValue({
      endpoint: 'https://cf-east.dwn.enbox.id',
      registrationRequirements: ['blind-token-v1'],
      blindToken: sampleDescriptor,
    });
    mocks.fetchEndpointQuota.mockResolvedValue({
      did: 'did:dht:alice00000000000000000000000000',
      registered: true,
      suspended: false,
      quotaEnforced: true,
      storage: {
        usedBytes: 10 * 1024 * 1024,
        limitBytes: 50 * 1024 * 1024,
        remainingBytes: 40 * 1024 * 1024,
        messageCount: 12,
        maxMessages: 0,
      },
      leases: [
        {
          leaseId: 'lease-1',
          bytes: 50 * 1024 * 1024,
          expiresAt: '2027-11-01T00:00:00.000Z',
          active: true,
        },
      ],
    });
  });

  it('displays vault balance, storage quota bar, and active leases', async () => {
    renderWithProviders(<CreditsPage />);

    expect(await screen.findByText('5 credits')).toBeInTheDocument();
    expect(screen.getByText('1 × c4 (4 cr)')).toBeInTheDocument();
    expect(await screen.findByRole('progressbar', { name: /cf-east\.dwn\.enbox\.id/i })).toBeInTheDocument();
    expect(screen.getByText(/10 MiB of 50 MiB used/i)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('previews and claims an invite code into the credit vault', async () => {
    mocks.previewInvite.mockResolvedValue({
      valid: true,
      credits: 16,
      remainingUses: 1,
      expiresAt: null,
    });
    mocks.claimAndStoreInvite.mockResolvedValue({
      addedCredits: 16,
      tokens: [],
      summary: {
        mintUrl: 'https://mint.enbox.id',
        totalCredits: 21,
        mintTokenCount: 3,
        expiredMintTokenCount: 0,
        denominations: [{ unit: 'c16', count: 1, creditsPerToken: 16, totalCredits: 16 }],
        serviceTokenCounts: {},
        totalServiceTokenCount: 0,
      },
    });

    const { user } = renderWithProviders(<CreditsPage />);
    await screen.findByText('5 credits');

    const input = screen.getByLabelText(/invite code/i);
    await user.type(input, 'ENBOX-ALPHA');
    await user.click(screen.getByRole('button', { name: /check invite/i }));

    expect(await screen.findByText(/16 credits \(\$4\.00\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /claim credits/i }));
    await waitFor(() => {
      expect(mocks.claimAndStoreInvite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ inviteCode: 'ENBOX-ALPHA' }),
      );
    });
    expect(await screen.findByText('21 credits')).toBeInTheDocument();
  });

  it('adds a storage block and refreshes credits', async () => {
    mocks.redeemStorageBlockForDid.mockResolvedValue({
      registration: { success: true, grantedBytes: 50 * 1024 * 1024, activeLeases: 2 },
      unit: 'storage-50mb-1yr',
      grantedBytes: 50 * 1024 * 1024,
      durationSeconds: 31_536_000,
    });
    mocks.refreshMintCredits.mockResolvedValue({
      mintUrl: 'https://mint.enbox.id',
      totalCredits: 5,
      mintTokenCount: 2,
      expiredMintTokenCount: 0,
      denominations: [],
      serviceTokenCounts: {},
      totalServiceTokenCount: 0,
    });

    const { user } = renderWithProviders(<CreditsPage />);
    const addBtn = await screen.findByRole('button', { name: /add storage block/i });
    await waitFor(() => expect(addBtn).toBeEnabled());

    await user.click(addBtn);
    await waitFor(() => {
      expect(mocks.redeemStorageBlockForDid).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          did: 'did:dht:alice00000000000000000000000000',
          endpoint: 'https://cf-east.dwn.enbox.id',
          descriptor: sampleDescriptor,
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: /refresh credits/i }));
    await waitFor(() => {
      expect(mocks.refreshMintCredits).toHaveBeenCalledTimes(1);
    });
  });
});
