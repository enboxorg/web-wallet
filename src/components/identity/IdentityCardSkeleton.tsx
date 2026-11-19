export function IdentityCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading identity profile"
      className="surface-card flex w-full flex-col overflow-hidden rounded-3xl border border-border-default bg-surface-1"
    >
      {/* Banner */}
      <div className="h-28 w-full animate-pulse bg-surface-2" />

      {/* Content area */}
      <div className="relative px-5 pb-4">
        {/* Avatar placeholder */}
        <div className="-mt-9">
          <div className="size-16 animate-pulse rounded-full bg-surface-3 ring-4 ring-surface-1" />
        </div>

        <div className="mt-3 space-y-2.5">
          {/* Name placeholder */}
          <div className="h-5 w-32 animate-pulse rounded-md bg-surface-2" />
          {/* Tagline placeholder */}
          <div className="h-3.5 w-48 animate-pulse rounded-md bg-surface-2" />
        </div>

        {/* Profile ID placeholder */}
        <div className="mt-5 border-t border-border-subtle pt-4">
          <div className="h-3.5 w-40 animate-pulse rounded-md bg-surface-2" />
        </div>
      </div>
    </div>
  );
}
