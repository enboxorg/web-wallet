import type { ConnectPermissionRequest } from '@enbox/connect';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import type { ProtocolSetupStatus } from '@/features/connect/protocol-install';
import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';
import { formatRelativeExpiry } from '@/features/connect/connect-session-duration';
import { truncateDid } from '@/lib/utils';

import { PermissionDisplay } from './PermissionDisplay';

interface RenewSessionDisplayProps {
  appName: string;
  permissions: ConnectPermissionRequest[];
  detection: ConnectRefreshDetection;
  lookupPending: boolean;
  lookupError: boolean;
  ownerLabel?: string;
  ownerSupported: boolean;
  protocolSetupStatuses?: Record<string, ProtocolSetupStatus>;
  requesterLabel?: string;
  sessionDurationSeconds?: number;
  onSessionDurationSecondsChange?: (seconds: number) => void;
  onRetryProtocolSetup?: () => void;
  now?: Date;
}

function statusDisplay(status: ConnectRefreshDetection['status']): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'bg-success/10 text-success' };
    case 'expiring-soon':
      return { label: 'Expiring soon', className: 'bg-warning/10 text-warning' };
    case 'expired':
      return { label: 'Expired', className: 'bg-surface-3 text-text-ghost' };
    case 'revoked':
      return { label: 'Revoked', className: 'bg-error/10 text-error' };
    default:
      return { label: 'Not found', className: 'bg-error/10 text-error' };
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
  protocolSetupStatuses,
  requesterLabel,
  sessionDurationSeconds,
  onSessionDurationSecondsChange,
  onRetryProtocolSetup,
  now = new Date(),
}: RenewSessionDisplayProps) {
  const display = statusDisplay(detection.status);
  const matched = detection.matchState === 'matched';

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border-default bg-surface-2 p-4">
        <div className="flex items-start gap-3">
          <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-primary">
              Renew access for {appName}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              Review the requested access before issuing fresh grants to the existing app delegate.
            </p>
          </div>
        </div>

        {lookupPending && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2 text-xs text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking the previous connection…
          </div>
        )}

        {!lookupPending && lookupError && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            The wallet could not verify the previous connection. Renewal is blocked.
          </div>
        )}

        {!lookupPending && !lookupError && detection.matchState === 'not-found' && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-secondary">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            No previous session for this delegate was found in this wallet. Use the original wallet or start a new connection.
          </div>
        )}

        {!lookupPending && !lookupError && detection.matchState === 'ambiguous' && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This delegate is linked to more than one profile, so the wallet cannot safely choose which one to renew.
          </div>
        )}

        {!lookupPending && !lookupError && detection.matchState === 'profile-mismatch' && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This request names a different profile than the previous session. Renewal is blocked.
          </div>
        )}

        {!lookupPending && !lookupError && matched && !ownerSupported && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            The app no longer supports the profile used by this connection. Renewal is blocked.
          </div>
        )}

        {!lookupPending && !lookupError && matched && ownerSupported && detection.pinnedOwnerDid && (
          <div className="mt-3 space-y-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-3">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <span>
                Renewing as <strong className="font-medium text-text-primary">{ownerLabel ?? truncateDid(detection.pinnedOwnerDid)}</strong>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              {detection.status === 'active' ? (
                <CheckCircle2 className="h-4 w-4 text-success" />
              ) : (
                <Clock3 className="h-4 w-4 text-text-ghost" />
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${display.className}`}>
                {display.label}
              </span>
              {detection.status === 'revoked' ? (
                <span>Previous access was revoked.</span>
              ) : detection.expiresAt && (
                <span>
                  Previous access {detection.status === 'expired' ? 'expired' : 'expires'}{' '}
                  {formatRelativeExpiry(detection.expiresAt, now)}
                </span>
              )}
            </div>
          </div>
        )}
      </section>

      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={protocolSetupStatuses}
        existingSessionCount={0}
        requesterLabel={requesterLabel}
        sessionDurationSeconds={sessionDurationSeconds}
        onSessionDurationSecondsChange={onSessionDurationSecondsChange}
        onRetryProtocolSetup={onRetryProtocolSetup}
        renewal
      />
    </div>
  );
}
