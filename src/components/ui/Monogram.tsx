import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

interface MonogramProps {
  /** Text the initial is taken from. */
  label: string;
  /** Stable identity for the tint (defaults to `label`), e.g. an origin or URI. */
  seed?: string;
  /** Replace the initial with an icon. */
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm : 'size-8 rounded-lg text-xs [&>svg]:size-4',
  md : 'size-10 rounded-xl text-sm [&>svg]:size-[18px]',
  lg : 'size-14 rounded-2xl text-xl [&>svg]:size-6',
};

/** Stable 0–359 hue for a string (FNV-1a), so a given app always gets the same tint. */
function hueFor(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 360;
}

function initialOf(label: string): string {
  const match = label.trim().match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '?';
}

/**
 * Decorative tinted tile with an initial or icon. Purely visual: the adjacent
 * text always carries the name, so the tile is hidden from assistive tech.
 */
export function Monogram({ label, seed, icon, size = 'md', className }: MonogramProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'monogram inline-flex shrink-0 select-none items-center justify-center font-semibold',
        sizes[size],
        className,
      )}
      style={{ '--mono-h': hueFor(seed ?? label) } as CSSProperties}
    >
      {icon ?? initialOf(label)}
    </span>
  );
}
