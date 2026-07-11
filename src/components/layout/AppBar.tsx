import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui-store';

export interface AppBarProps {
  isDesktop?: boolean;
  title?: string;
  className?: string;
}

/**
 * Top bar visible on all screen sizes.
 *
 * - Desktop: shows logo text (since sidebar has it too, this is subtle branding),
 *   sync indicator, theme toggle
 * - Mobile: shows centred "enbox" brand, theme toggle (nav is in BottomNav)
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
      data-testid="appbar"
    >
      {/* Inner container mirrors the main content column so the bar's
          contents align with the page gutter, and its height matches the
          sidebar's brand row on desktop. */}
      <div className="relative mx-auto flex h-14 w-full max-w-[var(--content-width)] items-center px-[var(--content-gutter)] lg:h-16">
      {/* Mobile: centred brand */}
      {!isDesktop && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xl font-bold tracking-tight text-text-primary select-none">
          en<span className="text-accent">b</span>ox
        </span>
      )}

      {/* Desktop: optional page title */}
      {isDesktop && title && (
        <h1 className="text-sm font-semibold text-text-primary truncate">
          {title}
        </h1>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right-side actions */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={cn(
            'inline-flex items-center justify-center w-12 h-12 rounded-md',
            'text-text-secondary hover:text-text-primary hover:bg-surface-2',
            'transition-colors duration-[var(--duration-fast)]',
          )}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
      </div>
    </header>
  );
}

/* ---- Icons ---- */

function SunIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2m0 12v2M4.22 4.22l1.42 1.42m8.72 8.72 1.42 1.42M2 10h2m12 0h2M4.22 15.78l1.42-1.42m8.72-8.72 1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.003 8.003 0 1010.586 10.586z" />
    </svg>
  );
}
