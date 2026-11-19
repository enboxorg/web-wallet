import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { Monogram } from './Monogram';

/** Highest quality first; the first one that loads wins. */
const ICON_PATHS = ['/apple-touch-icon.png', '/favicon.svg', '/favicon.ico'];

/**
 * The best icon a site serves from its own origin, or undefined while
 * loading or when it has none. Candidates load in parallel and the
 * highest-priority one that loads is used, so a missing high-res icon
 * doesn't delay the plain favicon.
 */
function useSiteIconSrc(origin: string | undefined): string | undefined {
  const [src, setSrc] = useState<string>();

  useEffect(() => {
    setSrc(undefined);
    let base: URL;
    try {
      if (origin === undefined) return;
      base = new URL(origin);
      if (base.protocol !== 'https:' && base.protocol !== 'http:') return;
    } catch {
      return;
    }

    let cancelled = false;
    const candidates = ICON_PATHS.map((path) => new URL(path, base).href);
    // undefined: still loading; null: failed; string: loaded.
    const results: Array<string | null | undefined> = candidates.map(() => undefined);
    const images: HTMLImageElement[] = [];

    const settle = () => {
      if (cancelled) return;
      for (const result of results) {
        if (result === undefined) return;
        if (result !== null) {
          setSrc(result);
          return;
        }
      }
    };

    candidates.forEach((href, index) => {
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        results[index] = image.naturalWidth >= 16 ? href : null;
        settle();
      };
      image.onerror = () => {
        results[index] = null;
        settle();
      };
      image.src = href;
      images.push(image);
    });

    return () => {
      cancelled = true;
      for (const image of images) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [origin]);

  return src;
}

interface SiteIconProps {
  /**
   * Origin to load the icon from. Pass only a verified origin: an icon from a
   * self-reported origin would lend a requester someone else's identity.
   */
  origin?: string;
  label: string;
  seed: string;
  className?: string;
}

/** A site's own icon in a neutral tile, falling back to a lettered monogram. */
export function SiteIcon({ origin, label, seed, className }: SiteIconProps) {
  const src = useSiteIconSrc(origin);

  if (!src) {
    return <Monogram label={label} seed={seed} size="lg" className={className} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 ring-1 ring-inset ring-border-default',
        className,
      )}
    >
      <img src={src} alt="" referrerPolicy="no-referrer" data-testid="site-icon" className="size-full object-contain" />
    </span>
  );
}
