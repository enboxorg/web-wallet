import { Moon, Sun } from 'lucide-react';

import { EnboxMarkTile, Wordmark } from '@/components/brand/Brand';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

export interface AppBarProps {
  isDesktop?: boolean;
  title?: string;
  className?: string;
}

/**
 * Top bar for mobile and tablet: the brand on the left, the theme toggle on
 * the right. Navigation lives in the BottomNav; on desktop the sidebar
 * carries all of this instead.
 */
export function AppBar({ isDesktop = true, title, className }: AppBarProps) {
  const { theme, setTheme } = useUIStore();

  return (
    <header
      className={cn(
        'sticky top-0 z-[var(--z-sticky)]',
        'bg-surface-glass backdrop-blur-[var(--glass-blur)] backdrop-saturate-[var(--glass-saturate)]',
        'border-b border-border-subtle',
        className,
      )}
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      data-testid="appbar"
    >
      {/* Inner container mirrors the main content column so the bar's
          contents align with the page gutter. */}
      <div className="mx-auto flex h-14 w-full max-w-[var(--content-width)] items-center gap-2.5 px-[var(--content-gutter)] lg:h-16">
        {!isDesktop && (
          <>
            <EnboxMarkTile size="sm" />
            <Wordmark className="text-lg" />
          </>
        )}

        {/* Desktop: optional page title */}
        {isDesktop && title && (
          <h1 className="truncate text-sm font-semibold text-text-primary">
            {title}
          </h1>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn(
            '-mr-2 inline-flex size-11 items-center justify-center rounded-xl',
            'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
            'transition-colors duration-[var(--duration-base)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          )}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}
