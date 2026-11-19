import { useCallback } from 'react';
import { cn } from '@/lib/utils';

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    );
    const current = tabs.findIndex((t) => t === document.activeElement);
    if (current === -1) return;

    let next = -1;
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;

    if (next >= 0) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  }, []);

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn(
        'flex gap-1 border-b border-border-subtle',
        'overflow-x-auto scrollbar-none',
        className,
      )}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
}

interface TabProps {
  id?: string;
  panelId?: string;
  active?: boolean;
  onClick?: () => void;
  /** Optional count, shown as a quiet pill and announced as "(n)". */
  count?: number;
  children: React.ReactNode;
  className?: string;
}

export function Tab({ id, panelId, active, onClick, count, children, className }: TabProps) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 px-3 py-3 text-sm font-medium transition-colors duration-[var(--duration-fast)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent rounded-t-lg',
        active
          ? 'text-text-primary'
          : 'text-text-tertiary hover:text-text-primary',
        className,
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'min-w-5 rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums',
              active ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-text-tertiary',
            )}
          >
            {count}
          </span>
          <span className="sr-only">({count})</span>
        </>
      )}
      {active && (
        <span
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

interface TabPanelProps {
  id?: string;
  labelledBy?: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ id, labelledBy, active, children, className }: TabPanelProps) {
  if (!active) return null;

  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className={cn('py-4', className)}
    >
      {children}
    </div>
  );
}
