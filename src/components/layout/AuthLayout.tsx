import { cn } from '@/lib/utils';

interface AuthLayoutProps {
  children: React.ReactNode;
  /** Width of the content column. Forms (restore, backup) want a little more room. */
  width?: 'sm' | 'md';
  /** Centre short screens; let long forms start near the top instead. */
  align?: 'center' | 'start';
  className?: string;
}

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-md' } as const;

/**
 * Stage for everything outside the unlocked app: welcome, unlock, restore
 * and first-profile setup. One backdrop and one column, so moving between
 * these screens feels like a single continuous flow.
 */
export function AuthLayout({ children, width = 'sm', align = 'center', className }: AuthLayoutProps) {
  return (
    <div
      data-testid="auth-layout"
      className={cn(
        'ambient ambient-hero flex min-h-dvh flex-col overflow-hidden bg-surface-0 px-5',
        'animate-[fadeIn_0.3s_ease-out]',
        className,
      )}
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)',
      }}
    >
      <div
        data-testid="auth-layout-column"
        className={cn(
          'mx-auto flex w-full flex-1 flex-col',
          WIDTHS[width],
          align === 'center' ? 'justify-center' : 'justify-start sm:justify-center',
        )}
      >
        {children}
      </div>
    </div>
  );
}
