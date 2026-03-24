import { Fragment } from 'react';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  current: number;
  total: number;
  className?: string;
}

export function StepIndicator({ current, total, className }: StepIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {Array.from({ length: total }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className={cn(
              'h-px w-6',
              i <= current ? 'bg-accent' : 'bg-border-default',
            )} />
          )}
          <div className={cn(
            'h-2 w-2 rounded-full transition-colors',
            i === current ? 'bg-accent' : i < current ? 'bg-accent/50' : 'bg-border-default',
          )} />
        </Fragment>
      ))}
    </div>
  );
}
