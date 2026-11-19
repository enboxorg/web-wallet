import { cn } from '@/lib/utils';

export interface ButtonStyleProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-soft' | 'danger-ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/*
 * A solid button that can't be pressed goes neutral instead of fading: a
 * half-transparent accent turns muddy on dark surfaces and washes out its
 * label on light ones. A busy button (aria-busy) keeps its colour, so the
 * action in flight stays recognisable.
 */
const solidDisabled = cn(
  '[&:disabled:not([aria-busy=true])]:bg-surface-3 [&:disabled:not([aria-busy=true])]:bg-none',
  '[&:disabled:not([aria-busy=true])]:text-text-tertiary [&:disabled:not([aria-busy=true])]:shadow-none',
  '[&[aria-busy=true]]:opacity-80',
);
const fadedDisabled = 'disabled:opacity-50';

const variantStyles: Record<NonNullable<ButtonStyleProps['variant']>, string> = {
  // `btn-lit` adds the lit-from-above sheen and the accent glow the button rests on.
  primary: cn('btn-lit bg-accent font-semibold text-accent-text hover:bg-accent-hover', solidDisabled),
  secondary: cn('btn-raised bg-surface-2 font-medium text-text-primary border border-border-default hover:bg-surface-3 hover:border-border-strong', fadedDisabled),
  ghost: cn('bg-transparent font-medium text-text-secondary hover:text-text-primary hover:bg-surface-2', fadedDisabled),
  danger: cn('bg-danger font-semibold text-white shadow-sm hover:bg-danger-hover', solidDisabled),
  'danger-soft': cn('bg-error/10 font-medium text-error border border-error/20 hover:bg-error/15 hover:border-error/30', fadedDisabled),
  'danger-ghost': cn('bg-transparent font-medium text-error hover:bg-error/10', fadedDisabled),
};

/* Touch targets stay at 44px on coarse pointers; mouse UIs get denser controls. */
const sizeStyles: Record<NonNullable<ButtonStyleProps['size']>, string> = {
  sm: 'min-h-11 pointer-fine:min-h-9 px-3.5 py-1.5 text-[13px] rounded-[10px]',
  md: 'min-h-11 px-5 py-2.5 text-sm rounded-xl',
  lg: 'min-h-[3.25rem] px-8 py-3 text-[15px] rounded-2xl',
};

const baseStyles = cn(
  'inline-flex select-none items-center justify-center gap-2',
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)]',
  'active:scale-[0.98] disabled:active:scale-100',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
  'disabled:cursor-not-allowed',
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
