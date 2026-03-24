import { cn } from '@/lib/utils';

interface SyncIndicatorProps {
  className?: string;
}

export function SyncIndicator({ className }: SyncIndicatorProps) {
  // TODO: wire up real sync status from DWN sync engine
  const synced = true;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs',
        className,
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          synced ? 'bg-success' : 'bg-warning animate-pulse',
        )}
        aria-hidden="true"
      />
      <span className="text-text-secondary">
        {synced ? 'Synced' : 'Syncing'}
      </span>
    </div>
  );
}
