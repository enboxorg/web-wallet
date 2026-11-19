import { useState } from 'react';
import { Copy, Check, Shield } from 'lucide-react';
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
        'group relative flex flex-col overflow-hidden rounded-2xl border border-border-default',
        'bg-surface-1 text-left w-full',
        'transition-[border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)]',
        onClick && 'cursor-pointer hover:border-border-strong hover:shadow-lg hover:-translate-y-0.5',
        'has-[[data-card-action]:focus-visible]:ring-2 has-[[data-card-action]:focus-visible]:ring-accent has-[[data-card-action]:focus-visible]:ring-offset-2 has-[[data-card-action]:focus-visible]:ring-offset-surface-0',
        className,
      )}
    >
      {/* Hero banner */}
      <div className="h-24 w-full overflow-hidden">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="h-full w-full bg-surface-2 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(var(--accent-rgb),0.32),transparent_60%)]" />
        )}
      </div>

      {/* Content area */}
      <div className="relative px-4 pb-4">
        {/* Avatar overlapping hero */}
        <div className="-mt-8">
          <Avatar src={avatarUrl} name={displayName} size="lg" className="ring-4 ring-surface-1" />
        </div>

        <div className="mt-2">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight text-text-primary">
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
            {persona && !sameName(persona, displayName) && (
              <Badge tone="accent" title="Persona: only you see this">{persona}</Badge>
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
              className="relative z-10 shrink-0 rounded p-1 text-text-ghost transition-colors hover:text-text-secondary"
              aria-label="Copy profile ID"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
            </button>
          </div>
          {appCount !== undefined && appCount > 0 && (
            <Badge className="mt-3" icon={<Shield />}>
              {appCount} with access
            </Badge>
          )}
        </div>
      </div>
    </article>
  );
}
