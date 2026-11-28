import { EnboxMark } from '@/components/brand/Brand';
import { cn } from '@/lib/utils';

interface LoaderProps {
  message?: string;
  /** Optional calm secondary hint shown below the primary status message. */
  detail?: string;
  className?: string;
  /** Fill the entire viewport (used for top-level loading states). */
  fullScreen?: boolean;
}

export function Loader({ message, detail, className, fullScreen }: LoaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        fullScreen
          ? 'ambient ambient-hero flex-1 min-h-dvh bg-surface-0 animate-[fadeIn_0.3s_ease-out]'
          : 'h-full min-h-48',
        className,
      )}
    >
      {fullScreen ? (
        // Top-level waits wear the brand: the mark, orbited by the spinner.
        <div className="relative flex size-16 items-center justify-center">
          <EnboxMark className="size-7 text-text-primary" />
          <div
            className="absolute inset-0 rounded-full border-2 border-accent/15 border-t-accent animate-spin"
            role="status"
            aria-label="Loading"
          />
        </div>
      ) : (
        <div
          className="size-8 rounded-full border-2 border-accent/20 border-t-accent animate-spin"
          role="status"
          aria-label="Loading"
        />
      )}
      {message && (
        <p className="text-sm text-text-secondary">{message}</p>
      )}
      {detail && (
        <p className="max-w-xs text-center text-xs leading-relaxed text-text-tertiary">{detail}</p>
      )}
    </div>
  );
}
