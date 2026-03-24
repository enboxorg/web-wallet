import { cn } from '@/lib/utils';

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

export function TabList({ children, className }: TabListProps) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1 border-b border-border-subtle',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface TabProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Tab({ active, onClick, children, className }: TabProps) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative px-4 py-2.5 text-sm font-medium transition-colors duration-[var(--duration-fast)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active
          ? 'text-accent'
          : 'text-text-tertiary hover:text-text-primary',
        className,
      )}
    >
      {children}
      {active && (
        <span
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-full"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

interface TabPanelProps {
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ active, children, className }: TabPanelProps) {
  if (!active) return null;

  return (
    <div
      role="tabpanel"
      className={cn('py-4', className)}
    >
      {children}
    </div>
  );
}
