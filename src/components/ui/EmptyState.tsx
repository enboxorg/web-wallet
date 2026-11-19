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
    <div className={cn('flex flex-col items-center justify-center gap-3 px-4 py-14 text-center', className)}>
      {icon && (
        <div className="mb-1 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-text-tertiary ring-1 ring-inset ring-border-subtle [&>svg]:size-6">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm leading-relaxed text-text-tertiary">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
