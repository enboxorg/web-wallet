import { cn } from '@/lib/utils';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  /** `soft` is a tinted pill; `outline` keeps a transparent fill for low-emphasis tags. */
  variant?: 'soft' | 'outline';
  icon?: React.ReactNode;
  title?: string;
  className?: string;
  children: React.ReactNode;
}

const softTones: Record<BadgeTone, string> = {
  neutral : 'bg-surface-3/70 text-text-secondary ring-border-default',
  accent  : 'bg-accent/10 text-accent ring-accent/20',
  success : 'bg-success/10 text-success ring-success/20',
  warning : 'bg-warning/10 text-warning ring-warning/25',
  danger  : 'bg-error/10 text-error ring-error/25',
  info    : 'bg-info/10 text-info ring-info/20',
};

const outlineTones: Record<BadgeTone, string> = {
  neutral : 'text-text-tertiary ring-border-default',
  accent  : 'text-accent ring-accent/30',
  success : 'text-success ring-success/30',
  warning : 'text-warning ring-warning/30',
  danger  : 'text-error ring-error/30',
  info    : 'text-info ring-info/30',
};

const sizes = {
  sm : 'min-h-5 px-2 text-[11px] gap-1 [&>svg]:size-3',
  md : 'min-h-6 px-2.5 text-xs gap-1.5 [&>svg]:size-3.5',
};

/** Compact status / tag pill. Colour is never the only signal: always pair it with text. */
export function Badge({
  tone = 'neutral',
  size = 'sm',
  variant = 'soft',
  icon,
  title,
  className,
  children,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium leading-none ring-1 ring-inset',
        sizes[size],
        variant === 'soft' ? softTones[tone] : outlineTones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
