export function IdentityCardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading identity profile"
      className="flex flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-1 w-full"
    >
      {/* Hero area */}
      <div className="h-24 w-full bg-surface-2 animate-pulse" />

      {/* Content area */}
      <div className="relative px-4 pb-4">
        {/* Avatar placeholder */}
        <div className="-mt-8">
          <div className="h-16 w-16 rounded-full bg-surface-2 animate-pulse ring-4 ring-surface-1" />
        </div>

        <div className="mt-2 space-y-2">
          {/* Name placeholder */}
          <div className="h-5 w-32 rounded bg-surface-2 animate-pulse" />
          {/* Tagline placeholder */}
          <div className="h-3 w-48 rounded bg-surface-2 animate-pulse" />
          {/* DID placeholder */}
          <div className="h-3 w-40 rounded bg-surface-2 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
