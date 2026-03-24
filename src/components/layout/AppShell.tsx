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
 * - Desktop (>= 1024px): persistent sidebar + top AppBar + scrollable content
 * - Mobile / Tablet (< 1024px): minimal top AppBar + content + fixed bottom tab bar
 *
 * On mobile, the bottom tab bar replaces the sidebar/drawer pattern entirely,
 * giving a native app feel (like iOS/Android wallet apps).
 */
export function AppShell({ sidebarItems, bottomTabItems, children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const { sidebarMini, setSidebarMini } = useUIStore();
  const { lock } = useAuth();

  const handleNavigate = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0" data-testid="app-shell">
      {/* Desktop: persistent sidebar */}
      {isDesktop && (
        <Sidebar
          items={sidebarItems}
          currentPath={location.pathname}
          onNavigate={handleNavigate}
          mini={sidebarMini}
          onLock={lock}
          onToggleMini={() => setSidebarMini(!sidebarMini)}
        />
      )}

      {/* Main content column */}
      <div className="flex flex-col flex-1 min-w-0">
        <OfflineBanner />
        {/* Top bar: desktop shows full bar, mobile shows minimal bar */}
        <AppBar isDesktop={isDesktop} />

        {/* Scrollable content area */}
        <main
          className={
            'flex-1 overflow-y-auto px-[var(--content-gutter)] py-6'
            + (!isDesktop ? ' pb-24' : '') /* extra bottom padding for bottom nav */
          }
          data-testid="main-content"
        >
          <div className="mx-auto max-w-[var(--content-width)]">
            <SeedPhraseWarningBanner />
            {children}
          </div>
        </main>
      </div>

      {/* Mobile / Tablet: fixed bottom tab bar */}
      {!isDesktop && (
        <BottomNav
          items={bottomTabItems}
          currentPath={location.pathname}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
