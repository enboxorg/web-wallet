import { Lock, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
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

  const footerButton = cn(
    'flex w-full items-center gap-3 rounded-lg text-sm font-medium',
    'text-text-tertiary hover:bg-surface-2 hover:text-text-primary',
    'transition-colors duration-[var(--duration-fast)]',
    mini ? 'justify-center py-2.5' : 'px-3 py-2',
  );
  const themeLabel = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border-subtle bg-surface-1',
        'transition-[width] duration-[200ms] ease-[var(--ease-out)]',
        mini ? 'w-[var(--sidebar-mini-width)]' : 'w-[var(--sidebar-width)]',
        className,
      )}
      data-testid="sidebar"
    >
      {/* Logo */}
      <div
        className={cn(
          'flex h-16 shrink-0 items-center',
          mini ? 'justify-center px-0' : 'px-6',
        )}
      >
        <span className="select-none text-xl font-bold tracking-tight text-text-primary">
          {mini ? (
            <span className="text-accent">b</span>
          ) : (
            <>
              en<span className="text-accent">b</span>ox
            </>
          )}
        </span>
      </div>

      {/* Nav sections */}
      <nav className={cn('flex-1 overflow-y-auto py-2', mini ? 'px-2' : 'px-3')} aria-label="Main navigation">
        {sections.map(({ section, items: sectionItems }) => (
          <div key={section ?? '__ungrouped'} className="mb-4">
            {section && !mini && (
              <div className="px-3 pb-1.5 pt-1 text-[11px] font-medium uppercase tracking-wider text-text-ghost">
                {section}
              </div>
            )}

            <div className="space-y-0.5">
              {sectionItems.map((item) => {
                const active = isNavItemActive(currentPath, item);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => onNavigate(item.path)}
                    title={mini ? item.label : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg text-sm font-medium',
                      'transition-colors duration-[var(--duration-fast)]',
                      mini ? 'justify-center py-2.5' : 'px-3 py-2',
                      active
                        ? 'bg-accent-muted text-accent'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
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

      {/* Footer actions */}
      <div className={cn('space-y-0.5 border-t border-border-subtle py-3', mini ? 'px-2' : 'px-3')}>
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            title={mini ? themeLabel : undefined}
            aria-label={themeLabel}
            className={footerButton}
          >
            {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            {!mini && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>
        )}
        {onToggleMini && (
          <button
            type="button"
            onClick={onToggleMini}
            title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
            className={footerButton}
          >
            {mini ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
            {mini ? <span className="sr-only">Expand sidebar</span> : <span>Collapse</span>}
          </button>
        )}
        {onLock && (
          <button
            type="button"
            onClick={onLock}
            title="Lock wallet"
            className={footerButton}
          >
            <Lock size={18} aria-hidden="true" />
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
