import { cn } from '@/lib/utils';

/**
 * The Enbox mark: three nested boxes stepping forward, with a node in the
 * front one. The two back boxes carry the product accent; the front box and
 * node use the current text colour so the mark holds up in both themes.
 */
export function EnboxMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      data-testid="enbox-mark"
      className={cn('size-6 shrink-0', className)}
    >
      <rect x="4" y="4" width="20" height="20" rx="4.5" stroke="var(--accent)" strokeOpacity="0.42" strokeWidth="2" />
      <rect x="10" y="10" width="20" height="20" rx="4.5" stroke="var(--accent)" strokeOpacity="0.78" strokeWidth="2" />
      <rect x="16" y="16" width="20" height="20" rx="4.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="26" cy="26" r="2.75" fill="currentColor" />
    </svg>
  );
}

const TILE_SIZES = {
  sm : { tile: 'size-8 rounded-[10px]', mark: 'size-5' },
  md : { tile: 'size-10 rounded-xl', mark: 'size-6' },
  lg : { tile: 'size-16 rounded-[20px]', mark: 'size-10' },
} as const;

/** The mark set in a raised tile, the way the app icon reads on a home screen. */
export function EnboxMarkTile({
  size = 'md',
  className,
}: {
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  const styles = TILE_SIZES[size];
  return (
    <span
      aria-hidden="true"
      data-testid="enbox-mark-tile"
      className={cn(
        'surface-card inline-flex shrink-0 items-center justify-center border border-border-default bg-surface-2 text-text-primary',
        styles.tile,
        className,
      )}
    >
      <EnboxMark className={styles.mark} />
    </span>
  );
}

/** "enbox" set in the brand's way: a bold accent b between quiet letters. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span data-testid="enbox-wordmark" className={cn('select-none font-semibold tracking-tight', className)}>
      <span className="text-text-primary">en</span>
      <span className="font-bold text-accent">b</span>
      <span className="text-text-primary">ox</span>
    </span>
  );
}

/**
 * Concentric boxes radiating from the mark, with a soft pool of accent light
 * at the centre. Purely decorative: position it behind the brand lockup.
 */
export function BrandHalo({ className }: { className?: string }) {
  const rings = [
    { size: 116, opacity: 0.32 },
    { size: 188, opacity: 0.2 },
    { size: 268, opacity: 0.12 },
    { size: 356, opacity: 0.07 },
    { size: 452, opacity: 0.04 },
  ];
  return (
    <div
      aria-hidden="true"
      data-testid="brand-halo"
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 size-[28.25rem] -translate-x-1/2 -translate-y-1/2',
        className,
      )}
    >
      <div className="absolute inset-[32%] rounded-full bg-accent/20 blur-3xl" />
      <svg
        viewBox="0 0 452 452"
        fill="none"
        focusable="false"
        className="absolute inset-0 size-full origin-center animate-[halo-breathe_9s_ease-in-out_infinite]"
      >
        {rings.map(({ size, opacity }) => (
          <rect
            key={size}
            data-testid="brand-halo-ring"
            x={(452 - size) / 2}
            y={(452 - size) / 2}
            width={size}
            height={size}
            rx={size * 0.24}
            stroke="var(--accent)"
            strokeOpacity={opacity}
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}
