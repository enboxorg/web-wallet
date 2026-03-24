import { cn } from '@/lib/utils';

interface EnboxLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeStyles = {
  sm: { text: 'text-xl', subtitle: 'text-[10px]' },
  md: { text: 'text-3xl', subtitle: 'text-xs' },
  lg: { text: 'text-5xl', subtitle: 'text-sm' },
} as const;

export function EnboxLogo({ size = 'md', className }: EnboxLogoProps) {
  const styles = sizeStyles[size];

  return (
    <div className={cn('flex flex-col items-center select-none', className)}>
      <span className={cn(styles.text, 'font-semibold tracking-tight')}>
        <span className="text-text-primary">en</span>
        <span className="text-accent font-bold">b</span>
        <span className="text-text-primary">ox</span>
      </span>
      <span className={cn(styles.subtitle, 'text-text-tertiary tracking-wide mt-0.5')}>
        Identity Wallet
      </span>
    </div>
  );
}
