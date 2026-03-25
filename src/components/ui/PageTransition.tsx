import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div className={cn('animate-[fadeIn_0.25s_ease-out]', className)}>
      {children}
    </div>
  );
}
