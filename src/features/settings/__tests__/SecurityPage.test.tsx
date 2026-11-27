import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecurityPage from '../SecurityPage';

const mockLock = vi.fn();
const mockChangePin = vi.fn();
const mockVerifyPin = vi.fn();
const passkey = vi.hoisted(() => ({ stored: false }));

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({ lock: mockLock, changePin: mockChangePin, verifyPin: mockVerifyPin }),
}));

vi.mock('@/lib/passkeys', () => ({
  hasStoredPasskeyCredential: () => passkey.stored,
}));

// Mock toast to avoid side-effects
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('SecurityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders "Security" heading', () => {
    render(<SecurityPage />);
    expect(
      screen.getByRole('heading', { name: /^security$/i }),
    ).toBeInTheDocument();
  });

  it('does not advertise settings that are not available yet', () => {
    render(<SecurityPage />);
    expect(screen.queryByText(/not yet available/i)).not.toBeInTheDocument();
  });

  it('shows auto-lock timeout options', () => {
    render(<SecurityPage />);
    expect(screen.getByText('5 minutes')).toBeInTheDocument();
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('30 minutes')).toBeInTheDocument();
    expect(screen.getByText('1 hour')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows Lock wallet section', () => {
    render(<SecurityPage />);
    expect(
      screen.getByRole('heading', { name: /lock wallet/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /lock now/i }),
    ).toBeInTheDocument();
  });

  it('clicking a timeout option updates the selected state', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />);

    await user.click(screen.getByRole('radio', { name: '30 minutes' }));

    expect(screen.getByRole('radio', { name: '30 minutes' })).toHaveAttribute('aria-checked', 'true');
    // The default option (10 minutes) should no longer be selected
    expect(screen.getByRole('radio', { name: '10 minutes' })).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Lock now calls lock', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />);
    await user.click(screen.getByRole('button', { name: /lock now/i }));
    expect(mockLock).toHaveBeenCalledOnce();
  });

  it('stores selected timeout in localStorage and notifies listeners', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    window.addEventListener('enbox:auto-lock-changed', onChanged);
    render(<SecurityPage />);

    await user.click(screen.getByText('30 minutes'));
    expect(localStorage.getItem('enbox:autoLockTimeout')).toBe(
      String(30 * 60 * 1000),
    );
    expect(onChanged).toHaveBeenCalledOnce();
    window.removeEventListener('enbox:auto-lock-changed', onChanged);
  });

  describe('Change PIN', () => {
    beforeEach(() => {
      passkey.stored = false;
      mockVerifyPin.mockImplementation((pin: string) => pin === '1234');
      mockChangePin.mockResolvedValue(undefined);
    });

    async function openDialog() {
      const user = userEvent.setup();
      render(<SecurityPage />);
      await user.click(screen.getByRole('button', { name: 'Change PIN' }));
      return { user, dialog: await screen.findByRole('dialog') };
    }

    it('walks through current, new and confirmed PIN', async () => {
      const { user, dialog } = await openDialog();
      expect(within(dialog).getByText('Enter your current PIN')).toBeInTheDocument();

      await user.keyboard('9999');
      expect(await within(dialog).findByText(/That PIN isn’t right/)).toBeInTheDocument();

      await user.keyboard('1234');
      expect(await within(dialog).findByText('Choose a new PIN')).toBeInTheDocument();
      await user.keyboard('5678');
      expect(await within(dialog).findByText('Enter your new PIN again')).toBeInTheDocument();
      await user.keyboard('5679');
      expect(await within(dialog).findByText(/PINs didn’t match/)).toBeInTheDocument();

      await user.keyboard('5678');
      await user.keyboard('5678');
      await waitFor(() => expect(mockChangePin).toHaveBeenCalledWith('1234', '5678'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('rejects reusing the current PIN', async () => {
      const { user, dialog } = await openDialog();
      await user.keyboard('1234');
      await within(dialog).findByText('Choose a new PIN');
      await user.keyboard('1234');
      expect(await within(dialog).findByText(/That’s your current PIN/)).toBeInTheDocument();
      expect(mockChangePin).not.toHaveBeenCalled();
    });

    it('is not offered for passkey wallets, which have no PIN', () => {
      passkey.stored = true;
      render(<SecurityPage />);
      expect(screen.queryByRole('button', { name: 'Change PIN' })).not.toBeInTheDocument();
    });
  });
});
