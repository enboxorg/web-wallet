import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockPhrase =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const mockConfirmBackup = vi.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useBackupSeedStore is called with a selector function: useBackupSeedStore((s) => s.phrase)
vi.mock('@/stores/backup-seed-store', () => ({
  useBackupSeedStore: (selector: (state: any) => any) => {
    const state = {
      phrase: mockPhrase,
      backedUp: false,
      confirmBackup: mockConfirmBackup,
    };
    return selector(state);
  },
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useExportIdentity: () => ({ mutateAsync: vi.fn() }),
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

import BackupPage from '../BackupPage';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page heading', () => {
    renderWithProviders(<BackupPage />);
    expect(
      screen.getByRole('heading', { name: /backup.*recovery/i }),
    ).toBeInTheDocument();
  });

  it('shows export section heading', () => {
    renderWithProviders(<BackupPage />);
    expect(
      screen.getByRole('heading', { name: /export profiles/i }),
    ).toBeInTheDocument();
  });

  it('shows "Recommended" badge', () => {
    renderWithProviders(<BackupPage />);
    expect(screen.getByText(/recommended/i)).toBeInTheDocument();
  });

  it('shows the recovery phrase words', () => {
    renderWithProviders(<BackupPage />);
    // The phrase has 12 words; first is "abandon", last is "about"
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(12);
  });

  it('shows word numbers in the phrase grid', () => {
    renderWithProviders(<BackupPage />);
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('12.')).toBeInTheDocument();
  });

  it('has a copy phrase button', () => {
    renderWithProviders(<BackupPage />);
    expect(
      screen.getByRole('button', { name: /copy phrase/i }),
    ).toBeInTheDocument();
  });

  it('has a confirmation button', () => {
    renderWithProviders(<BackupPage />);
    expect(
      screen.getByRole('button', { name: /i've saved it/i }),
    ).toBeInTheDocument();
  });

  it('shows confirmation dialog when clicking the save button', async () => {
    const { user } = renderWithProviders(<BackupPage />);

    await user.click(
      screen.getByRole('button', { name: /i've saved it/i }),
    );

    // Dialog should appear
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    // The dialog asks "Are you sure you've saved your recovery phrase?"
    expect(
      within(dialog).getByText(/are you sure/i),
    ).toBeInTheDocument();
  });

  it('shows the "Export All" button', () => {
    renderWithProviders(<BackupPage />);
    expect(
      screen.getByRole('button', { name: /export all/i }),
    ).toBeInTheDocument();
  });

  it('disables Export All when there are no identities', () => {
    renderWithProviders(<BackupPage />);
    expect(
      screen.getByRole('button', { name: /export all/i }),
    ).toBeDisabled();
  });

  it('shows identity count', () => {
    renderWithProviders(<BackupPage />);
    expect(screen.getByText(/0 identities available/i)).toBeInTheDocument();
  });
});
