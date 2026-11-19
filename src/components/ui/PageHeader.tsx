import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  onBack?: () => boolean | void;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, backTo, onBack, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex min-w-0 items-start gap-2">
        {backTo && (
          <Link
            to={backTo}
            onClick={(event) => {
              if (onBack?.() === false) {
                event.preventDefault();
              }
            }}
            className="-ml-2.5 shrink-0 rounded-xl p-2.5 text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-text-tertiary">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
