import { cn } from '@/lib/utils';

interface LoaderProps {
  message?: string;
  className?: string;
  /** Fill the entire viewport (used for top-level loading states). */
  fullScreen?: boolean;
}

export function Loader({ message, className, fullScreen }: LoaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        fullScreen ? 'flex-1 min-h-screen bg-surface-0' : 'h-full min-h-48',
        className,
      )}
    >
      <div
        className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin"
        role="status"
        aria-label="Loading"
      />
      {message && (
        <p className="text-sm text-text-secondary">{message}</p>
      )}
    </div>
  );
}
