import type { ConnectPermissionRequest } from '@enbox/connect';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
} from 'lucide-react';

import type { ModuleSetupStatus } from '@/features/connect/module-install';
import type { ConnectRefreshDetection, RefreshAccessSplit } from '@/features/connect/connect-refresh';
import { formatRelativeExpiry } from '@/features/connect/connect-session-duration';
import { Monogram } from '@/components/ui/Monogram';
import { cn, truncateDid } from '@/lib/utils';

import { PermissionDisplay } from './PermissionDisplay';

interface RenewSessionDisplayProps {
  appName: string;
  permissions: ConnectPermissionRequest[];
  detection: ConnectRefreshDetection;
  lookupPending: boolean;
  lookupError: boolean;
  ownerLabel?: string;
  ownerSupported: boolean;
  moduleSetupStatuses?: Record<string, ModuleSetupStatus>;
  requesterLabel?: string;
  sessionDurationSeconds?: number;
  requestedSessionTtlSeconds?: number;
  onSessionDurationSecondsChange?: (seconds: number) => void;
  onRetryModuleSetup?: () => void;
  /**
   * What the delegate actually held before, from the wallet's own grants.
   * When anything is new, the screen is about adding access, not renewing.
   */
  split?: RefreshAccessSplit;
  now?: Date;
}

function statusDisplay(status: ConnectRefreshDetection['status']): {
  label: string;
  textClassName: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Active', textClassName: 'text-success' };
    case 'expiring-soon':
      return { label: 'Expiring soon', textClassName: 'text-warning' };
    case 'expired':
      return { label: 'Expired', textClassName: 'text-text-secondary' };
    case 'permissions-changed':
      return { label: 'Permissions changed', textClassName: 'text-warning' };
    case 'revoked':
      return { label: 'Revoked', textClassName: 'text-error' };
    default:
      return { label: 'Not found', textClassName: 'text-error' };
  }
}

export function RenewSessionDisplay({
  appName,
  permissions,
  detection,
  lookupPending,
  lookupError,
  ownerLabel,
  ownerSupported,
  moduleSetupStatuses,
  requesterLabel,
  sessionDurationSeconds,
  requestedSessionTtlSeconds,
  onSessionDurationSecondsChange,
  onRetryModuleSetup,
  split,
  now = new Date(),
}: RenewSessionDisplayProps) {
  const display = statusDisplay(detection.status);
  const matched = detection.matchState === 'matched';
  const addsAccess = (split?.added.length ?? 0) > 0;

  const blocked = (message: string, tone: 'warning' | 'error' = 'error') => (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs',
        tone === 'error' ? 'border-error/30 bg-error/[0.06] text-error' : 'border-warning/30 bg-warning/[0.06] text-text-secondary',
      )}
    >
      <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'warning' && 'text-warning')} />
      {message}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Mirrors "Approve as" on a first connection: which profile, and how
          the previous access stands. The header sentence already says what
          the request is, so this stays a single quiet row. */}
      <section aria-labelledby="renew-owner-heading" className="space-y-2">
        <h2 id="renew-owner-heading" className="text-[13px] font-medium text-text-secondary">
          {addsAccess ? 'Approving as' : 'Renewing as'}
        </h2>

        {lookupPending && (
          <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-2 px-3 py-2.5 text-xs text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking the previous connection…
          </div>
        )}
        {!lookupPending && lookupError
          && blocked('The wallet could not verify the previous connection. Renewal is blocked.')}
        {!lookupPending && !lookupError && detection.matchState === 'not-found'
          && blocked('No previous session for this delegate was found in this wallet. Use the original wallet or start a new connection.', 'warning')}
        {!lookupPending && !lookupError && detection.matchState === 'ambiguous'
          && blocked('This delegate is linked to more than one profile, so the wallet cannot safely choose which one to renew.')}
        {!lookupPending && !lookupError && detection.matchState === 'profile-mismatch'
          && blocked('This request names a different profile than the previous session. Renewal is blocked.')}
        {!lookupPending && !lookupError && matched && !ownerSupported
          && blocked('The app no longer supports the profile used by this connection. Renewal is blocked.')}

        {!lookupPending && !lookupError && matched && ownerSupported && detection.pinnedOwnerDid && (
          <div className="flex items-center gap-3 rounded-xl border border-border-default bg-surface-1 px-3 py-2.5">
            <Monogram label={ownerLabel ?? detection.pinnedOwnerDid} seed={detection.pinnedOwnerDid} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">
                {ownerLabel ?? truncateDid(detection.pinnedOwnerDid)}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-text-tertiary">
                <span className={cn('inline-flex items-center gap-1 font-medium', display.textClassName)}>
                  {detection.status === 'active'
                    ? <CheckCircle2 className="size-3" aria-hidden="true" />
                    : <Clock3 className="size-3" aria-hidden="true" />}
                  {display.label}
                </span>
                <span aria-hidden="true" className="text-text-ghost">·</span>
                {detection.status === 'revoked' ? (
                  <span>Previous access was revoked.</span>
                ) : detection.status === 'permissions-changed' ? (
                  <span>Some previous permissions were revoked.</span>
                ) : detection.expiresAt && (
                  <span>
                    Previous access {detection.status === 'expired' ? 'expired' : 'expires'}{' '}
                    {formatRelativeExpiry(detection.expiresAt, now)}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </section>

      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={moduleSetupStatuses}
        existingSessionCount={0}
        requesterLabel={requesterLabel}
        sessionDurationSeconds={sessionDurationSeconds}
        requestedSessionTtlSeconds={requestedSessionTtlSeconds}
        onSessionDurationSecondsChange={onSessionDurationSecondsChange}
        onRetryModuleSetup={onRetryModuleSetup}
        renewal
        accessSections={addsAccess && split ? [
          {
            id          : 'added',
            title       : 'New access',
            description : `${appName} hasn't had this before.`,
            permissions : split.added,
          },
          {
            id          : 'renewed',
            title       : 'Renewing existing access',
            permissions : split.renewed,
          },
        ] : undefined}
      />
    </div>
  );
}
