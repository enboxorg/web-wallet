import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { truncateDid, copyToClipboard } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

interface PublicIdentityCardProps {
  did: string;
  displayName?: string;
  tagline?: string;
  bio?: string;
  avatarUrl?: string | null;
  heroUrl?: string | null;
  className?: string;
}

export function PublicIdentityCard({
  did,
  displayName,
  tagline,
  bio,
  avatarUrl,
  heroUrl,
  className,
}: PublicIdentityCardProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopyDid() {
    const ok = await copyToClipboard(did);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      className={cn(
        'surface-card flex w-full flex-col overflow-hidden rounded-3xl border border-border-default',
        'bg-surface-1',
        className,
      )}
    >
      {/* Hero banner */}
      <div className="relative h-36 w-full overflow-hidden bg-surface-2 md:h-48">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(120%_140%_at_0%_0%,rgba(var(--accent-rgb),0.36),transparent_58%),radial-gradient(120%_140%_at_100%_0%,rgba(var(--accent-2-rgb),0.28),transparent_60%)]" />
        )}
        <div className="banner-scrim h-24" aria-hidden="true" />
      </div>

      {/* Content */}
      <div className="relative px-5 pb-6 sm:px-8 sm:pb-7">
        <div className="-mt-14">
          <Avatar src={avatarUrl} name={displayName} size="xl" className="shadow-raised ring-4 ring-surface-1" />
        </div>

        <div className="mt-4">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
            {displayName ?? 'Unnamed'}
          </h2>
          {tagline && (
            <p className="mt-1 text-[15px] leading-relaxed text-text-secondary">{tagline}</p>
          )}

          {/* DID with copy button */}
          <div className="mt-3 flex items-center gap-1">
            <p className="truncate font-mono text-xs text-text-ghost">
              {truncateDid(did)}
            </p>
            <button
              type="button"
              onClick={handleCopyDid}
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-text-ghost transition-colors hover:bg-surface-3 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Copy profile ID"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {bio && (
            <p className="mt-5 max-w-2xl whitespace-pre-wrap border-t border-border-subtle pt-5 text-[15px] leading-relaxed text-text-secondary">
              {bio}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
