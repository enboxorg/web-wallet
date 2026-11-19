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
            className="btn-raised -ml-0.5 mr-1.5 mt-0.5 shrink-0 rounded-xl border border-border-default bg-surface-2 p-2 text-text-secondary transition-colors hover:border-border-strong hover:bg-surface-3 hover:text-text-primary sm:mt-1"
            aria-label="Back"
          >
            <ArrowLeft className="size-[18px]" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-9 tracking-[-0.025em] text-text-primary sm:text-[2rem] sm:leading-10">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-text-tertiary">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
