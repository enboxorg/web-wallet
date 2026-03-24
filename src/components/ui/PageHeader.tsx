import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  backTo?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, backTo, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="flex items-start gap-3">
        {backTo && (
          <Link
            to={backTo}
            className="mt-1 rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-text-secondary">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
