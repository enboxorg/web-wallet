import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SecurityPage from '../SecurityPage';

const mockLock = vi.fn();

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({ lock: mockLock }),
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

  it('stores selected timeout in localStorage', async () => {
    const user = userEvent.setup();
    render(<SecurityPage />);

    await user.click(screen.getByText('30 minutes'));
    expect(localStorage.getItem('enbox:autoLockTimeout')).toBe(
      String(30 * 60 * 1000),
    );
  });
});
