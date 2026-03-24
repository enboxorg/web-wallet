import { cn } from '@/lib/utils';
import { truncateDid } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';

interface IdentityCardProps {
  did: string;
  displayName?: string;
  tagline?: string;
  avatarUrl?: string | null;
  heroUrl?: string | null;
  persona?: string;
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
  onClick,
  className,
}: IdentityCardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
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
          <p className="mt-1 text-xs text-text-ghost font-mono truncate">
            {truncateDid(did)}
          </p>
        </div>
      </div>
    </Component>
  );
}
