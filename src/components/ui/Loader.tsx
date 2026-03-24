import { cn } from '@/lib/utils';

interface LoaderProps {
  message?: string;
  className?: string;
}

export function Loader({ message, className }: LoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center h-full min-h-48 gap-4', className)}>
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
