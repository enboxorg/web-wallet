import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BottomNav } from '../BottomNav';
import type { NavItem } from '../types';

const makeItems = (): NavItem[] => [
  { path: '/', label: 'Home', icon: <span data-testid="icon-home">H</span> },
  { path: '/wallet', label: 'Wallet', icon: <span data-testid="icon-wallet">W</span> },
  { path: '/settings', label: 'Settings', icon: <span data-testid="icon-settings">S</span> },
];

describe('BottomNav', () => {
  it('renders all nav items', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/" onNavigate={vi.fn()} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('active item has text-accent class', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/wallet" onNavigate={vi.fn()} />);
    const walletButton = screen.getByText('Wallet').closest('button')!;
    expect(walletButton).toHaveClass('text-accent');
  });

  it('inactive items have text-text-ghost class', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/" onNavigate={vi.fn()} />);
    const walletButton = screen.getByText('Wallet').closest('button')!;
    const settingsButton = screen.getByText('Settings').closest('button')!;
    expect(walletButton).toHaveClass('text-text-ghost');
    expect(settingsButton).toHaveClass('text-text-ghost');
  });

  it('clicking item calls onNavigate with correct path', async () => {
    const onNavigate = vi.fn();
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/" onNavigate={onNavigate} />);

    await userEvent.click(screen.getByText('Wallet'));
    expect(onNavigate).toHaveBeenCalledWith('/wallet');

    await userEvent.click(screen.getByText('Settings'));
    expect(onNavigate).toHaveBeenCalledWith('/settings');
  });

  it('has role="navigation" via aria-label', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/" onNavigate={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeInTheDocument();
  });

  it('root path "/" only matches exact "/"', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/wallet" onNavigate={vi.fn()} />);
    const homeButton = screen.getByText('Home').closest('button')!;
    // Home should NOT be active when on /wallet
    expect(homeButton).not.toHaveClass('text-accent');
    expect(homeButton).toHaveClass('text-text-ghost');
  });

  it('non-root paths match prefix (e.g. "/settings" matches "/settings/security")', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/settings/security" onNavigate={vi.fn()} />);
    const settingsButton = screen.getByText('Settings').closest('button')!;
    expect(settingsButton).toHaveClass('text-accent');
  });

  it('active item has aria-current="page"', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/wallet" onNavigate={vi.fn()} />);
    const walletButton = screen.getByText('Wallet').closest('button')!;
    expect(walletButton).toHaveAttribute('aria-current', 'page');
  });

  it('inactive items do not have aria-current', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/wallet" onNavigate={vi.fn()} />);
    const homeButton = screen.getByText('Home').closest('button')!;
    expect(homeButton).not.toHaveAttribute('aria-current');
  });

  it('renders icons for each item', () => {
    const items = makeItems();
    render(<BottomNav items={items} currentPath="/" onNavigate={vi.fn()} />);
    expect(screen.getByTestId('icon-home')).toBeInTheDocument();
    expect(screen.getByTestId('icon-wallet')).toBeInTheDocument();
    expect(screen.getByTestId('icon-settings')).toBeInTheDocument();
  });
});
