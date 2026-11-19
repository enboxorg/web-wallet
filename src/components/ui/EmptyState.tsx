import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-4 py-16 text-center', className)}>
      {icon && (
        <div className="surface-card mb-2 flex size-16 items-center justify-center rounded-[20px] border border-border-default bg-surface-2 text-text-secondary [&>svg]:size-7">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-text-tertiary">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
