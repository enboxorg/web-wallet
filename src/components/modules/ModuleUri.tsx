import { Fragment } from 'react';

import { splitAfterSlashes, splitUriHost } from '@/lib/uri-display';
import { cn } from '@/lib/utils';

/**
 * Text that may wrap after each path segment, so a long URI breaks at a `/`
 * instead of mid-word. Nothing is added to the text itself: it still reads,
 * selects and copies as the exact URI.
 */
function WrapAtSlashes({ text }: { text: string }) {
  return (
    <>
      {splitAfterSlashes(text).map((piece, index) => (
        // Pieces never reorder and the same text can repeat, so the position
        // is the only stable key.
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {piece}
        </Fragment>
      ))}
    </>
  );
}

interface ModuleUriProps {
  uri: string;
  className?: string;
}

/**
 * A module's URI in full. The URI is what identifies a module — its name is
 * only a label — so it wraps instead of being shortened. For web URIs the host
 * reads a step brighter than the rest, the way an address bar marks the site,
 * because the host is the part that says who the module belongs to.
 */
export function ModuleUri({ uri, className }: ModuleUriProps) {
  const parts = splitUriHost(uri);

  return (
    <span
      data-testid="module-uri"
      translate="no"
      dir="ltr"
      className={cn(
        'block wrap-anywhere font-mono text-[11px] leading-[1.5] text-text-tertiary sm:text-xs',
        className,
      )}
    >
      {parts ? (
        <>
          {parts.before}
          <span className="text-text-primary">{parts.host}</span>
          <WrapAtSlashes text={parts.after} />
        </>
      ) : <WrapAtSlashes text={uri} />}
    </span>
  );
}
