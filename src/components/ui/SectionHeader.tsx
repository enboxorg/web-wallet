import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  id?: string;
  title: string;
  /** Quiet count shown beside the title. */
  count?: number;
  description?: React.ReactNode;
  /** Quiet metadata on the right, e.g. a count. */
  aside?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SectionHeader({ id, title, count, description, aside, action, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 id={id} className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          {title}
          {count !== undefined && (
            <span aria-hidden="true" className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-semibold tabular-nums text-text-tertiary">
              {count}
            </span>
          )}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{description}</p>
        )}
      </div>
      {(aside || action) && (
        <div className="flex shrink-0 items-center gap-2 text-xs text-text-ghost">
          {aside}
          {action}
        </div>
      )}
    </div>
  );
}
