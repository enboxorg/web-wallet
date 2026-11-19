import { Lock, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { EnboxMarkTile, Wordmark } from '@/components/brand/Brand';
import { cn } from '@/lib/utils';
import { isNavItemActive } from './nav-active';
import type { NavItem } from './types';

export interface SidebarProps {
  items: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  mini?: boolean;
  onLock?: () => void;
  onToggleMini?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  className?: string;
}

/**
 * Navigation sidebar. Renders nav items grouped by section.
 * Supports full-width (240px) and mini (64px icon-only) modes.
 */
export function Sidebar({
  items,
  currentPath,
  onNavigate,
  mini = false,
  onLock,
  onToggleMini,
  theme,
  onToggleTheme,
  className,
}: SidebarProps) {
  // Group items by section, preserving insertion order
  const sections = groupBySection(items);

  // Quiet square controls for theme and collapse; Lock gets a labelled button.
  const iconButton = cn(
    'inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]',
    'text-text-tertiary hover:bg-surface-2 hover:text-text-primary',
    'transition-colors duration-[var(--duration-base)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
  );
  const themeLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  const miniLabel = mini ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <aside
      className={cn(
        'relative z-10 flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-1 bg-(image:--sheen)',
        'transition-[width] duration-[240ms] ease-[var(--ease-out)]',
        mini ? 'w-[var(--sidebar-mini-width)]' : 'w-[var(--sidebar-width)]',
        className,
      )}
      data-testid="sidebar"
    >
      {/* Brand */}
      <div
        className={cn(
          'flex h-[4.5rem] shrink-0 items-center gap-3',
          mini ? 'justify-center px-0' : 'px-5',
        )}
      >
        <EnboxMarkTile size="sm" />
        {!mini && <Wordmark className="text-xl" />}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2 pt-1" aria-label="Main navigation">
        {sections.map(({ section, items: sectionItems }) => (
          <div key={section ?? '__ungrouped'} className="mb-5">
            {section && !mini && (
              <div className="eyebrow px-3 pb-2 pt-1">
                {section}
              </div>
            )}
            {section && mini && <div className="mx-2 mb-3 h-px bg-border-subtle" aria-hidden="true" />}

            <div className="space-y-1">
              {sectionItems.map((item) => {
                const active = isNavItemActive(currentPath, item);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => onNavigate(item.path)}
                    title={mini ? item.label : undefined}
                    className={cn(
                      'group relative flex w-full items-center gap-3 rounded-xl text-sm',
                      'transition-colors duration-[var(--duration-base)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      mini ? 'justify-center py-2.5' : 'px-3 py-2.5',
                      active
                        ? 'bg-accent-muted font-semibold text-accent'
                        : 'font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {/* Marker on the sidebar's edge for the current page. */}
                    {active && (
                      <span
                        className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_rgba(var(--accent-rgb),0.6)]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative size-5 shrink-0 [&>svg]:size-5" aria-hidden="true">
                      {item.icon}
                      {item.badge && (
                        <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-error ring-2 ring-surface-1" />
                      )}
                    </span>
                    {mini ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: appearance and layout on one side, the lock on the other. */}
      <div
        className={cn('flex items-center gap-1 border-t border-border-subtle p-3', mini && 'flex-col')}
      >
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            title={themeLabel}
            aria-label={themeLabel}
            className={iconButton}
          >
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
        )}
        {onToggleMini && (
          <button
            type="button"
            onClick={onToggleMini}
            title={miniLabel}
            aria-label={miniLabel}
            className={iconButton}
          >
            {mini ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        )}
        {onLock && (
          <button
            type="button"
            onClick={onLock}
            title="Lock wallet"
            className={cn(
              mini
                ? iconButton
                : cn(
                  'btn-raised ml-auto inline-flex h-9 items-center gap-2 rounded-[10px] border border-border-default bg-surface-2 px-3',
                  'text-[13px] font-medium text-text-secondary hover:border-border-strong hover:bg-surface-3 hover:text-text-primary',
                  'transition-colors duration-[var(--duration-base)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                ),
            )}
          >
            <Lock size={mini ? 18 : 15} aria-hidden="true" />
            {mini ? <span className="sr-only">Lock</span> : <span>Lock</span>}
          </button>
        )}
      </div>
    </aside>
  );
}

/* ---- Helpers ---- */

interface SectionGroup {
  section: string | undefined;
  items: NavItem[];
}

function groupBySection(items: NavItem[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  const map = new Map<string | undefined, NavItem[]>();

  for (const item of items) {
    const key = item.section;
    if (!map.has(key)) {
      const list: NavItem[] = [];
      map.set(key, list);
      groups.push({ section: key, items: list });
    }
    map.get(key)!.push(item);
  }

  return groups;
}
