import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../Sidebar';
import type { NavItem } from '../types';

/* ---- Fixtures ---- */

const icon = <svg data-testid="nav-icon" />;

const navItems: NavItem[] = [
  { path: '/identity', label: 'My DID', icon, section: 'Identity' },
  { path: '/identity/credentials', label: 'Credentials', icon, section: 'Identity' },
  { path: '/connect', label: 'Connections', icon, section: 'Connect' },
  { path: '/settings', label: 'Preferences', icon, section: 'Settings' },
];

function renderSidebar(overrides: Partial<Parameters<typeof Sidebar>[0]> = {}) {
  const defaultProps = {
    items: navItems,
    currentPath: '/identity',
    onNavigate: vi.fn(),
    ...overrides,
  };
  return { ...render(<Sidebar {...defaultProps} />), onNavigate: defaultProps.onNavigate };
}

/* ---- Tests ---- */

describe('Sidebar', () => {
  it('renders the logo text', () => {
    renderSidebar();
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar).toHaveTextContent('enbox');
  });

  it('renders all nav item labels', () => {
    renderSidebar();
    for (const item of navItems) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('renders section group labels', () => {
    renderSidebar();
    expect(screen.getByText('Identity')).toBeInTheDocument();
    expect(screen.getByText('Connect')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('marks the active item with aria-current="page"', () => {
    renderSidebar({ currentPath: '/connect' });
    const activeButton = screen.getByRole('button', { name: 'Connections' });
    expect(activeButton).toHaveAttribute('aria-current', 'page');
  });

  it('does not set aria-current on inactive items', () => {
    renderSidebar({ currentPath: '/connect' });
    const inactiveButton = screen.getByRole('button', { name: 'My DID' });
    expect(inactiveButton).not.toHaveAttribute('aria-current');
  });

  it('applies accent classes to the active item', () => {
    renderSidebar({ currentPath: '/identity' });
    const activeButton = screen.getByRole('button', { name: 'My DID' });
    expect(activeButton.className).toContain('bg-accent-muted');
    expect(activeButton.className).toContain('text-accent');
    expect(activeButton.className).toContain('border-accent');
  });

  it('calls onNavigate with the item path when clicked', async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderSidebar();

    await user.click(screen.getByRole('button', { name: 'Connections' }));
    expect(onNavigate).toHaveBeenCalledWith('/connect');
  });

  it('hides labels in mini mode', () => {
    renderSidebar({ mini: true });
    expect(screen.queryByText('My DID')).not.toBeInTheDocument();
    expect(screen.queryByText('Credentials')).not.toBeInTheDocument();
  });

  it('hides section labels in mini mode', () => {
    renderSidebar({ mini: true });
    expect(screen.queryByText('Identity')).not.toBeInTheDocument();
    expect(screen.queryByText('Connect')).not.toBeInTheDocument();
  });

  it('shows only icon-only logo ("b") in mini mode', () => {
    renderSidebar({ mini: true });
    const sidebar = screen.getByTestId('sidebar');
    // Should contain "b" but not the full "enbox"
    const logoContainer = sidebar.querySelector('.text-xl');
    expect(logoContainer).toBeTruthy();
    expect(logoContainer!.textContent).toBe('b');
  });

  it('applies mini width class in mini mode', () => {
    renderSidebar({ mini: true });
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('w-[var(--sidebar-mini-width)]');
  });

  it('applies full width class when not mini', () => {
    renderSidebar({ mini: false });
    const sidebar = screen.getByTestId('sidebar');
    expect(sidebar.className).toContain('w-[var(--sidebar-width)]');
  });

  it('adds title attribute to nav buttons in mini mode for accessibility', () => {
    renderSidebar({ mini: true });
    const buttons = screen.getAllByRole('button');
    // Nav item buttons should have title attributes
    const navButtons = buttons.filter((b) => b.getAttribute('title'));
    expect(navButtons.length).toBeGreaterThanOrEqual(navItems.length);
  });

  it('renders Lock button when onLock is provided', async () => {
    const user = userEvent.setup();
    const onLock = vi.fn();
    renderSidebar({ onLock });
    const lockButton = screen.getByRole('button', { name: /lock/i });
    expect(lockButton).toBeInTheDocument();
    await user.click(lockButton);
    expect(onLock).toHaveBeenCalledOnce();
  });

  it('does not render Lock button when onLock is not provided', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: /lock/i })).not.toBeInTheDocument();
  });

  it('merges custom className', () => {
    renderSidebar({ className: 'my-custom' });
    expect(screen.getByTestId('sidebar').className).toContain('my-custom');
  });
});
