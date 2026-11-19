import { cn } from '@/lib/utils';

export interface ButtonStyleProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'danger-ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const variantStyles: Record<NonNullable<ButtonStyleProps['variant']>, string> = {
  primary: 'bg-accent text-accent-text shadow-sm hover:bg-accent-hover',
  secondary: 'bg-surface-2 text-text-primary border border-border-default hover:bg-surface-3 hover:border-border-strong',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-2',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-hover',
  'danger-soft': 'bg-error/10 text-error border border-error/20 hover:bg-error/15 hover:border-error/30',
  'danger-ghost': 'bg-transparent text-error hover:bg-error/10',
};

/* Touch targets stay at 44px on coarse pointers; mouse UIs get denser controls. */
const sizeStyles: Record<NonNullable<ButtonStyleProps['size']>, string> = {
  sm: 'min-h-11 pointer-fine:min-h-9 px-3 py-1.5 text-xs rounded-lg',
  md: 'min-h-11 px-5 py-2.5 text-sm rounded-xl',
  lg: 'min-h-12 px-8 py-3 text-sm rounded-xl',
};

const baseStyles = cn(
  'inline-flex select-none items-center justify-center gap-2 font-medium',
  'transition-[background-color,border-color,color,transform,opacity] duration-[var(--duration-fast)]',
  'active:scale-[0.98] disabled:active:scale-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
  'disabled:opacity-50 disabled:cursor-not-allowed',
);

/**
 * Button styling for non-button elements (e.g. a router `Link` that should
 * look like a button). Navigation stays a link instead of a button nested
 * inside a link.
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonStyleProps = {}): string {
  return cn(baseStyles, variantStyles[variant], sizeStyles[size], className);
}
