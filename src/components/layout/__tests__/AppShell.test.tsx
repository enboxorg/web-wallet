import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NavItem } from '../types';

/* ---- Mocks ---- */

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/identity' }),
  useNavigate: () => mockNavigate,
}));

let mockIsDesktop = true;
vi.mock('../useMediaQuery', () => ({
  useMediaQuery: () => mockIsDesktop,
}));

const mockStore = {
  sidebarOpen: false,
  sidebarMini: false,
  theme: 'dark' as const,
  toggleSidebar: vi.fn(),
  setSidebarOpen: vi.fn(),
  setSidebarMini: vi.fn(),
  setTheme: vi.fn(),
};
vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => mockStore,
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({ lock: vi.fn() }),
}));

import { AppShell } from '../AppShell';

/* ---- Fixtures ---- */

const icon = <svg data-testid="nav-icon" />;

const sidebarItems: NavItem[] = [
  { path: '/identity', label: 'My DID', icon, section: 'Identity' },
  { path: '/connect', label: 'Connections', icon, section: 'Connect' },
];

const bottomTabItems: NavItem[] = [
  { path: '/', label: 'Home', icon },
  { path: '/search', label: 'Search', icon },
  { path: '/settings', label: 'Settings', icon },
];

function renderShell() {
  return render(
    <AppShell sidebarItems={sidebarItems} bottomTabItems={bottomTabItems}>
      <div data-testid="page-content">Page content</div>
    </AppShell>,
  );
}

/* ---- Tests ---- */

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDesktop = true;
    mockStore.sidebarOpen = false;
    mockStore.sidebarMini = false;
  });

  describe('Desktop (>= 1024px)', () => {
    it('renders the app shell container', () => {
      renderShell();
      expect(screen.getByTestId('app-shell')).toBeInTheDocument();
    });

    it('renders a persistent sidebar', () => {
      renderShell();
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('does not render a bottom nav bar', () => {
      renderShell();
      expect(screen.queryByTestId('bottom-nav')).not.toBeInTheDocument();
    });

    it('renders sidebar nav items', () => {
      renderShell();
      expect(screen.getByText('My DID')).toBeInTheDocument();
      expect(screen.getByText('Connections')).toBeInTheDocument();
    });

    it('renders children in the main content area', () => {
      renderShell();
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
      expect(screen.getByText('Page content')).toBeInTheDocument();
    });

    it('renders the AppBar', () => {
      renderShell();
      expect(screen.getByTestId('appbar')).toBeInTheDocument();
    });

    it('navigates when a sidebar item is clicked', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByRole('button', { name: 'Connections' }));
      expect(mockNavigate).toHaveBeenCalledWith('/connect');
    });
  });

  describe('Mobile / Tablet (< 1024px)', () => {
    beforeEach(() => {
      mockIsDesktop = false;
    });

    it('renders a bottom nav bar instead of sidebar', () => {
      renderShell();
      expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
      expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    });

    it('renders bottom tab items', () => {
      renderShell();
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Search')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('renders the AppBar with brand text', () => {
      renderShell();
      expect(screen.getByTestId('appbar')).toBeInTheDocument();
    });

    it('navigates when a bottom tab is tapped', async () => {
      const user = userEvent.setup();
      renderShell();
      await user.click(screen.getByText('Search'));
      expect(mockNavigate).toHaveBeenCalledWith('/search');
    });

    it('adds extra bottom padding to main content for bottom nav', () => {
      renderShell();
      const main = screen.getByTestId('main-content');
      expect(main.className).toContain('pb-[calc(6.5rem+env(safe-area-inset-bottom))]');
    });
  });

  it('renders main content inside a max-width container', () => {
    renderShell();
    const main = screen.getByTestId('main-content');
    const container = main.firstElementChild as HTMLElement;
    expect(container.className).toContain('max-w-[var(--content-width)]');
    expect(container.className).toContain('mx-auto');
  });
});
