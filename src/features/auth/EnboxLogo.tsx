import { BrandHalo, EnboxMarkTile } from '@/components/brand/Brand';
import { cn } from '@/lib/utils';

interface EnboxLogoProps {
  size?: 'sm' | 'md' | 'lg';
  /** Radiate the concentric-box halo from the mark (hero screens). */
  halo?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: { tile: 'sm', text: 'text-xl', subtitle: 'text-[10px]', gap: 'mt-2.5' },
  md: { tile: 'lg', text: 'text-3xl', subtitle: 'text-xs', gap: 'mt-5' },
  lg: { tile: 'lg', text: 'text-5xl', subtitle: 'text-sm', gap: 'mt-6' },
} as const;

/** Brand lockup for the screens outside the app shell: mark, wordmark, product line. */
export function EnboxLogo({ size = 'md', halo = false, className }: EnboxLogoProps) {
  const styles = sizeStyles[size];

  return (
    <div className={cn('flex flex-col items-center select-none', className)}>
      <div className="relative flex items-center justify-center">
        {halo && <BrandHalo />}
        <EnboxMarkTile size={styles.tile} className="relative shadow-raised" />
      </div>
      <span className={cn(styles.text, styles.gap, 'relative font-semibold tracking-tight')}>
        <span className="text-text-primary">en</span>
        <span className="text-accent font-bold">b</span>
        <span className="text-text-primary">ox</span>
      </span>
      <span className={cn(styles.subtitle, 'relative mt-1 font-mono uppercase tracking-[0.14em] text-text-tertiary')}>
        Identity Wallet
      </span>
    </div>
  );
}
