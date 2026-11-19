import { useState } from 'react';
import { Copy, Check, EyeOff, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { truncateDid, copyToClipboard, sameName } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';

interface IdentityCardProps {
  did: string;
  displayName?: string;
  tagline?: string;
  avatarUrl?: string | null;
  heroUrl?: string | null;
  persona?: string;
  appCount?: number;
  onClick?: () => void;
  className?: string;
}

export function IdentityCard({
  did,
  displayName,
  tagline,
  avatarUrl,
  heroUrl,
  persona,
  appCount,
  onClick,
  className,
}: IdentityCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(did);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    // The name is the card's real control; its ::after stretches over the
    // whole card so the card stays click-anywhere without nesting the copy
    // button inside another interactive element.
    <article
      className={cn(
        'surface-card group relative flex w-full flex-col overflow-hidden rounded-3xl border border-border-default',
        'bg-surface-1 text-left',
        'transition-[border-color,box-shadow,transform] duration-[var(--duration-slow)] ease-[var(--ease-out)]',
        onClick && 'cursor-pointer hover:-translate-y-1 hover:border-border-strong hover:shadow-raised',
        'has-[[data-card-action]:focus-visible]:ring-2 has-[[data-card-action]:focus-visible]:ring-accent has-[[data-card-action]:focus-visible]:ring-offset-2 has-[[data-card-action]:focus-visible]:ring-offset-surface-0',
        className,
      )}
    >
      {/* Banner, fading into the card so the avatar always has a calm seat. */}
      <div className="relative h-28 w-full overflow-hidden bg-surface-2">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 ease-[var(--ease-out)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,rgba(var(--accent-rgb),0.34),transparent_60%),radial-gradient(120%_140%_at_100%_0%,rgba(var(--accent-2-rgb),0.26),transparent_62%)]" />
        )}
        <div className="banner-scrim h-16" aria-hidden="true" />

        {/* Private label, on a dark chip that stays legible over any image. */}
        {persona && !sameName(persona, displayName) && (
          <span
            title="Persona: only you see this"
            className="absolute right-3 top-3 inline-flex max-w-[60%] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium leading-none text-white ring-1 ring-inset ring-white/15 backdrop-blur-md"
          >
            <EyeOff className="size-3 shrink-0 opacity-80" aria-hidden="true" />
            <span className="sr-only">Private label: </span>
            <span className="truncate">{persona}</span>
          </span>
        )}
      </div>

      {/* Content area. Not positioned, so the name's stretched hit area
          reaches the banner too; the avatar positions itself above it. */}
      <div className="flex flex-1 flex-col px-5 pb-4">
        <div className="-mt-9">
          <Avatar src={avatarUrl} name={displayName} size="lg" className="shadow-raised ring-4 ring-surface-1" />
        </div>

        <div className="mt-3 min-w-0">
          <h3 className="truncate text-lg font-semibold leading-6 tracking-tight text-text-primary">
            {onClick ? (
              <button
                type="button"
                data-card-action
                onClick={onClick}
                className="text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              >
                {displayName ?? 'Unnamed'}
              </button>
            ) : (
              displayName ?? 'Unnamed'
            )}
          </h3>
          {/* Reserve the line so cards in a row keep the same height. */}
          <p className="mt-1 min-h-5 truncate text-sm leading-5 text-text-secondary">
            {tagline}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
          <div className="flex min-w-0 items-center gap-0.5">
            <span className="truncate font-mono text-xs text-text-ghost">
              {truncateDid(did)}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="relative z-10 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-ghost transition-colors hover:bg-surface-3 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Copy profile ID"
            >
              {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
            </button>
          </div>
          {appCount !== undefined && appCount > 0 && (
            <Badge icon={<Shield />}>
              {appCount} with access
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}
