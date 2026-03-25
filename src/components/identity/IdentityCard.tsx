import { useState } from 'react';
import { Copy, Check, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { truncateDid, copyToClipboard } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

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
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border-default',
        'bg-surface-1 text-left w-full',
        'transition-all duration-[var(--duration-fast)]',
        onClick && 'cursor-pointer hover:border-border-strong hover:shadow-md hover:-translate-y-0.5',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
        className,
      )}
    >
      {/* Hero banner */}
      <div className="h-28 w-full overflow-hidden">
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

      {/* Content area */}
      <div className="relative px-4 pb-4">
        {/* Avatar overlapping hero */}
        <div className="-mt-8">
          <Avatar src={avatarUrl} name={displayName} size="lg" />
        </div>

        <div className="mt-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {displayName ?? 'Unnamed'}
            </h3>
            {persona && (
              <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-medium text-accent">
                {persona}
              </span>
            )}
          </div>
          {tagline && (
            <p className="mt-0.5 text-xs text-text-secondary truncate">
              {tagline}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-2">
            <span className="truncate font-mono text-xs text-text-ghost">
              {truncateDid(did)}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 p-1 rounded text-text-ghost hover:text-text-secondary transition-colors"
              aria-label="Copy DID"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
          {appCount !== undefined && appCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent mt-2">
              <Shield size={10} />
              {appCount} {appCount === 1 ? 'app' : 'apps'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
