import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from './types';

export interface SidebarProps {
  items: NavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  mini?: boolean;
  onLock?: () => void;
  onToggleMini?: () => void;
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
  className,
}: SidebarProps) {
  // Group items by section, preserving insertion order
  const sections = groupBySection(items);

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-surface-1 border-r border-border-default',
        'transition-[width] duration-[200ms] ease-[var(--ease-out)]',
        mini ? 'w-[var(--sidebar-mini-width)]' : 'w-[var(--sidebar-width)]',
        className,
      )}
      data-testid="sidebar"
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-14 shrink-0 border-b border-border-subtle',
          mini ? 'justify-center px-0' : 'px-6',
        )}
      >
        <span className="text-xl font-bold tracking-tight text-text-primary select-none">
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
      <nav className="flex-1 overflow-y-auto py-4" aria-label="Main navigation">
        {sections.map(({ section, items: sectionItems }) => (
          <div key={section ?? '__ungrouped'} className="mb-3">
            {section && !mini && (
              <div className="px-6 pb-1 pt-2 text-xs font-medium tracking-wider uppercase text-text-ghost">
                {section}
              </div>
            )}

            {sectionItems.map((item) => {
              const active = currentPath === item.path;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  title={mini ? item.label : undefined}
                  className={cn(
                    'flex items-center w-full gap-3 text-sm font-medium',
                    'transition-colors duration-[var(--duration-fast)]',
                    mini ? 'justify-center px-0 py-3 mx-auto' : 'px-6 py-2.5',
                    active
                      ? 'bg-accent-muted text-accent border-l-2 border-accent'
                      : 'text-text-secondary hover:bg-surface-3 hover:text-text-primary border-l-2 border-transparent',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="shrink-0 w-5 h-5" aria-hidden="true">
                    {item.icon}
                  </span>
                  {!mini && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Mini mode toggle */}
      {onToggleMini && (
        <div className={cn('border-t border-border-subtle py-2', mini ? 'px-0' : 'px-4')}>
          <button
            type="button"
            onClick={onToggleMini}
            title={mini ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center w-full gap-3 text-sm font-medium rounded-lg',
              'text-text-ghost hover:bg-surface-3 hover:text-text-secondary',
              'transition-colors duration-[var(--duration-fast)]',
              mini ? 'justify-center py-2.5' : 'px-3 py-2.5',
            )}
          >
            {mini ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            {!mini && <span>Collapse</span>}
          </button>
        </div>
      )}

      {/* Bottom actions */}
      {onLock && (
        <div className={cn('border-t border-border-subtle py-3', mini ? 'px-0' : 'px-4')}>
          <button
            type="button"
            onClick={onLock}
            title="Lock wallet"
            className={cn(
              'flex items-center w-full gap-3 text-sm font-medium rounded-lg',
              'text-text-secondary hover:bg-surface-3 hover:text-text-primary',
              'transition-colors duration-[var(--duration-fast)]',
              mini ? 'justify-center py-2.5' : 'px-3 py-2.5',
            )}
          >
            <LockIcon />
            {!mini && <span>Lock</span>}
          </button>
        </div>
      )}
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

function LockIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  );
}
