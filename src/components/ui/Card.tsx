import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingStyles = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ children, className, padding = 'md' }: CardProps) {
  return (
    <div className={cn(
      'rounded-xl border border-border-default bg-surface-1',
      paddingStyles[padding],
      className,
    )}>
      {children}
    </div>
  );
}
