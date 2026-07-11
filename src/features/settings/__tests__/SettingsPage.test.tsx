import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../SettingsPage';

const mockNavigate = vi.fn();
const mockLock = vi.fn();

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => mockNavigate,
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({ lock: mockLock }),
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Settings" heading', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument();
  });

  it('shows Security link with description', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(
      screen.getByText(/pin, auto-lock, and wallet security/i),
    ).toBeInTheDocument();
  });

  it('shows Backup & Recovery link with description', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Backup & Recovery')).toBeInTheDocument();
    expect(
      screen.getByText(/recovery phrase and profile export/i),
    ).toBeInTheDocument();
  });

  it('shows Lock Wallet button', () => {
    render(<SettingsPage />);
    expect(
      screen.getByRole('button', { name: /lock wallet/i }),
    ).toBeInTheDocument();
  });

  it('calls lock when Lock Wallet button is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByRole('button', { name: /lock wallet/i }));
    expect(mockLock).toHaveBeenCalledOnce();
  });

  it('navigates to /settings/security when Security is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByText('Security'));
    expect(mockNavigate).toHaveBeenCalledWith('/settings/security');
  });

  it('navigates to /settings/backup when Backup & Recovery is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.click(screen.getByText('Backup & Recovery'));
    expect(mockNavigate).toHaveBeenCalledWith('/settings/backup');
  });
});
