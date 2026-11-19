import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useMediaQuery } from './useMediaQuery';
import { Sidebar } from './Sidebar';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';
import { SeedPhraseWarningBanner } from './SeedPhraseWarningBanner';
import type { NavItem } from './types';

export interface AppShellProps {
  sidebarItems: NavItem[];
  bottomTabItems: NavItem[];
  children: React.ReactNode;
}

/**
 * Main layout shell for the unlocked wallet.
 *
 * - Desktop (>= 1024px): persistent sidebar (brand, nav, theme, lock) + scrollable content
 * - Mobile / Tablet (< 1024px): minimal top AppBar + content + pinned bottom tab bar
 *
 * On mobile, the bottom tab bar replaces the sidebar/drawer pattern entirely,
 * giving a native app feel (like iOS/Android wallet apps).
 */
export function AppShell({ sidebarItems, bottomTabItems, children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const { sidebarMini, setSidebarMini, theme, setTheme } = useUIStore();
  const { lock } = useAuth();

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-0" data-testid="app-shell">
      {/* Desktop: persistent sidebar */}
      {isDesktop && (
        <Sidebar
          items={sidebarItems}
          currentPath={location.pathname}
          onNavigate={handleNavigate}
          mini={sidebarMini}
          onLock={lock}
          onToggleMini={() => setSidebarMini(!sidebarMini)}
          theme={theme}
          onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
      )}

      {/* Main content column */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        data-testid="app-shell-content"
      >
        <OfflineBanner />
        {/* Mobile / tablet: brand + theme toggle. Desktop keeps both in the sidebar. */}
        {!isDesktop && <AppBar isDesktop={false} />}

        {/* Scrollable content area */}
        <main
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-[var(--content-gutter)] py-6 lg:py-10"
          data-testid="main-content"
        >
          <div className="mx-auto max-w-[var(--content-width)]">
            <SeedPhraseWarningBanner />
            {children}
          </div>
        </main>

        {/* Mobile / Tablet: pinned below the scrollport, never over its content. */}
        {!isDesktop && (
          <BottomNav
            items={bottomTabItems}
            currentPath={location.pathname}
            onNavigate={handleNavigate}
          />
        )}
      </div>
    </div>
  );
}
