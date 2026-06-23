import { Clock3 } from 'lucide-react';

export const CONNECT_SESSION_DURATION_LABEL = '24 hours';

export function SessionExpiryNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border-default bg-surface-1 px-3 py-2.5">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-primary">Temporary session</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
          Approved apps can use these permissions for {CONNECT_SESSION_DURATION_LABEL}. After that, they will need to reconnect.
        </p>
      </div>
    </div>
  );
}
