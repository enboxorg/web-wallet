import { cn } from '@/lib/utils';
import type { NavItem } from './types';

export interface BottomNavProps {
  items: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  className?: string;
}

/**
 * Native-feeling bottom tab bar for mobile/tablet viewports.
 *
 * - Fixed to the bottom of the viewport
 * - Safe area padding for notched devices (env(safe-area-inset-bottom))
 * - Icon + label layout, accent highlight on active tab
 * - Glass-blur background matching the AppBar aesthetic
 */
export function BottomNav({
  items,
  currentPath,
  onNavigate,
  className,
}: BottomNavProps) {
  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-[var(--z-sticky)]',
        'flex items-center justify-around',
        'bg-surface-1/80 backdrop-blur-sm',
        'border-t border-border-subtle',
        className,
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const active = isActive(currentPath, item.path);
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              'flex-1 py-2 pt-2.5',
              'transition-all duration-[var(--duration-fast)]',
              'active:scale-95 active:opacity-80',
              active
                ? 'text-accent'
                : 'text-text-ghost hover:text-text-secondary',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <span
              className={cn(
                'flex items-center justify-center w-6 h-6',
                active && 'drop-shadow-[0_0_6px_rgba(var(--accent-rgb),0.4)]',
              )}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <span className="text-[11px] font-medium leading-tight">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Check if a nav item is active. Matches exact path for root ("/")
 * and prefix match for other paths (e.g. "/settings" matches "/settings/security").
 */
function isActive(currentPath: string, itemPath: string): boolean {
  if (itemPath === '/') return currentPath === '/';
  return currentPath.startsWith(itemPath);
}
