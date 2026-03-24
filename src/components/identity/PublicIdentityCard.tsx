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
        'flex flex-col overflow-hidden rounded-lg border border-border-default',
        'bg-surface-1 w-full',
        className,
      )}
    >
      {/* Hero banner */}
      <div className="h-40 md:h-52 w-full overflow-hidden">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent-muted to-surface-2" />
        )}
      </div>

      {/* Content */}
      <div className="relative px-6 pb-6">
        <div className="-mt-12">
          <Avatar src={avatarUrl} name={displayName} size="xl" />
        </div>

        <div className="mt-3">
          <h2 className="text-lg font-semibold text-text-primary">
            {displayName ?? 'Unnamed'}
          </h2>
          {tagline && (
            <p className="mt-0.5 text-sm text-text-secondary">{tagline}</p>
          )}

          {/* DID with copy button */}
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-text-ghost font-mono truncate">
              {truncateDid(did)}
            </p>
            <button
              type="button"
              onClick={handleCopyDid}
              className="shrink-0 rounded-md p-1 text-text-ghost hover:text-text-secondary hover:bg-surface-2 transition-colors"
              aria-label="Copy DID"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {bio && (
            <p className="mt-4 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
              {bio}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
