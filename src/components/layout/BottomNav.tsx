import { cn } from '@/lib/utils';
import { isNavItemActive } from './nav-active';
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
 * - Pinned below the AppShell scrollport
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
        'shrink-0',
        'flex items-center justify-around',
        'bg-surface-glass backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]',
        'border-t border-border-subtle',
        className,
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const active = isNavItemActive(currentPath, item);
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => onNavigate(item.path)}
            className={cn(
              'flex flex-col items-center justify-center gap-1',
              'min-h-14 flex-1 pt-2 pb-1.5',
              'transition-colors duration-[var(--duration-fast)]',
              active
                ? 'text-accent'
                : 'text-text-ghost hover:text-text-secondary',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <span
              className={cn(
                'relative flex h-8 w-14 items-center justify-center rounded-full transition-colors',
                active ? 'bg-accent-muted' : 'bg-transparent',
              )}
              aria-hidden="true"
            >
              {item.icon}
              {item.badge && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-error" />
              )}
            </span>
            <span className={cn('text-[11px] leading-tight', active ? 'font-semibold' : 'font-medium')}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
