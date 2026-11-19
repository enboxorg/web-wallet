import { createContext, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  Shield,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { DwnModuleDefinition, DwnPermissionGrant } from '@enbox/agent';

import { usePermissions } from '@/enbox/hooks/use-permissions';
import { useModules } from '@/enbox/hooks/use-modules';
import { queryKeys } from '@/enbox/queries/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { Disclosure } from '@/components/ui/Disclosure';
import { Loader } from '@/components/ui/Loader';
import { Monogram } from '@/components/ui/Monogram';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ModuleGlyph } from '@/components/modules/ModuleGlyph';
import { ModuleUri } from '@/components/modules/ModuleUri';
import { PermissionActionChips, SupportActionsNote } from '@/components/connect/PermissionActionChips';
import { formatList, hidesSupportActions, visibleActions } from '@/components/connect/connect-scope-display';
import { truncateDid, cn } from '@/lib/utils';
import { describeModule, getModuleName, type ModuleDisplay } from '@/lib/module-names';
import {
  buildPermissionSections,
  type PermissionApplicationGroup,
  type PermissionGranteeGroup,
  type PermissionSessionGroup,
} from './permission-sessions';
import { groupGrantAccess, isGrantActive, type GrantAccessRow } from './permission-access';
import { describeConnectSession, type SessionEnvironmentSummary } from './permission-session-display';
import { renewExpiredSession } from './renew-session';
import {
  CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
  formatConnectSessionDuration,
  formatRelativeExpiry,
} from '@/features/connect/connect-session-duration';

interface PermissionsTabProps {
  did: string;
}

/** Everything the confirmation dialog needs; grants are re-filtered to active ones on confirm. */
interface RevokeTarget {
  title: string;
  body: ReactNode;
  confirm: string;
  success: string;
  grants: DwnPermissionGrant[];
}

interface RenewTarget {
  applicationName: string;
  session: PermissionSessionGroup;
}

/** Expired sessions render inline per app, capped so heavy renewal history can't flood the card. */
const MAX_VISIBLE_EXPIRED_SESSIONS = 3;

function formatDateTime(value: string | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle : 'medium',
    timeStyle : 'short',
  }).format(date);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function hostOf(origin: string | undefined): string | undefined {
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.host : origin;
  } catch {
    return origin;
  }
}

function activeGrants(grants: DwnPermissionGrant[]): DwnPermissionGrant[] {
  return grants.filter((grant) => isGrantActive(grant));
}

function accessRowName(row: GrantAccessRow): string {
  return row.module ? getModuleName(row.module) : 'All data';
}

/**
 * Installed module definitions by URI. Grants carry no definitions, and a
 * module is only presented as a shared-contexts companion when its installed
 * definition proves it (see describeModule).
 */
const ModuleDefinitionsContext = createContext<ReadonlyMap<string, DwnModuleDefinition>>(new Map());

function useModuleDisplay(uri: string | undefined): ModuleDisplay | undefined {
  const definitions = useContext(ModuleDefinitionsContext);
  return uri ? describeModule(uri, definitions.get(uri)) : undefined;
}

function accessRowDetail(row: GrantAccessRow, display: ModuleDisplay | undefined): string | undefined {
  if (row.contextId) return 'One shared context only';
  if (row.modulePath) return `Only ${row.modulePath}`;
  if (!display) return 'Not limited to one module';
  // A third-party module's own URI, shown in full under its name, is its detail.
  return display.isCore ? display.description : undefined;
}

function DeviceIcon({ summary, className }: { summary: SessionEnvironmentSummary; className?: string }) {
  const device = summary.device ?? '';
  const Icon = /iPhone|Android/i.test(device)
    ? Smartphone
    : /iPad/i.test(device)
      ? Tablet
      : summary.device ? Monitor : MonitorSmartphone;
  return <Icon className={className} aria-hidden="true" />;
}

// ── Access rows ─────────────────────────────────────────────────────

function AccessRowItem({
  row,
  onRevoke,
  revokeLabel,
}: {
  row: GrantAccessRow;
  onRevoke?: () => void;
  revokeLabel?: string;
}) {
  const nameId = useId();
  const name = accessRowName(row);
  const display = useModuleDisplay(row.module);
  const detail = accessRowDetail(row, display);
  // Modules are keyed by URI: anything that isn't a built-in definition is third-party.
  const thirdParty = display !== undefined && !display.isCore;
  const hasRecordAccess = row.actions.some((action) => action.kind === 'record');
  // Expired access is shown for context but can no longer be revoked.
  const inactive = !row.grants.some((grant) => isGrantActive(grant));

  return (
    <li aria-labelledby={nameId} className={cn('flex items-start gap-3 px-3 py-3', inactive && 'opacity-60')}>
      {display ? (
        <ModuleGlyph module={display} size="sm" />
      ) : (
        <Monogram label={name} icon={<TriangleAlert />} size="sm" />
      )}
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 sm:flex-1">
          <p id={nameId} className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-primary">
            <span className="truncate">
              {display?.companionOf ? getModuleName(display.companionOf) : name}
            </span>
            {display?.companionOf && (
              <span className="shrink-0 text-xs font-normal text-text-tertiary">Shared contexts</span>
            )}
          </p>
          {/* Same as the approval screen: the URI is the module's identity. */}
          {row.module && <ModuleUri uri={row.module} className="mt-0.5" />}
          {(detail || thirdParty) && (
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-text-tertiary">
              {detail && <span className="min-w-0 truncate" title={detail}>{detail}</span>}
              {detail && thirdParty && <span aria-hidden="true" className="text-text-ghost">·</span>}
              {thirdParty && (
                <span className="shrink-0" title="Not built into the wallet. A module is identified by its URI, not its name.">
                  Third-party
                </span>
              )}
            </p>
          )}
        </div>
        <PermissionActionChips
          actions={visibleActions(row.actions)}
          emphasizeSupport={!hasRecordAccess}
          className="mt-2 sm:mt-0 sm:max-w-[60%] sm:justify-end"
        />
      </div>
      {onRevoke && !inactive && (
        <button
          type="button"
          onClick={onRevoke}
          className="-mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-text-ghost transition-colors hover:bg-error/10 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:size-11"
          aria-label={revokeLabel ?? `Revoke ${name} access`}
          title="Revoke access"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}

function AccessList({
  rows,
  onRevokeRow,
  revokeLabel,
  label,
}: {
  rows: GrantAccessRow[];
  onRevokeRow?: (row: GrantAccessRow) => void;
  revokeLabel?: (row: GrantAccessRow) => string;
  label: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-text-tertiary">No data access.</p>;
  }

  return (
    <div className="space-y-2">
      <ul
        aria-label={label}
        className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-surface-0/40"
      >
        {rows.map((row) => (
          <AccessRowItem
            key={row.key}
            row={row}
            onRevoke={onRevokeRow ? () => onRevokeRow(row) : undefined}
            revokeLabel={revokeLabel?.(row)}
          />
        ))}
      </ul>
      <SupportActionsNote
        names={[...new Set(rows.filter((row) => hidesSupportActions(row.actions)).map(accessRowName))]}
        all={rows.every((row) => hidesSupportActions(row.actions))}
      />
    </div>
  );
}

// ── Sessions (devices) ──────────────────────────────────────────────

function Fact({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-24 shrink-0 text-text-ghost">{label}</dt>
      <dd className="min-w-0 truncate text-text-secondary" title={value}>{value}</dd>
    </div>
  );
}

function SessionDetails({ sessionGroup, summary }: {
  sessionGroup: PermissionSessionGroup;
  summary: SessionEnvironmentSummary;
}) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
        <Fact label="Approved" value={formatDateTime(sessionGroup.dateGranted)} />
        {sessionGroup.bundles.length > 1 && (
          <Fact label="Last renewed" value={formatDateTime(sessionGroup.lastRenewed)} />
        )}
        <Fact
          label={sessionGroup.active ? 'Access until' : 'Expired'}
          value={formatDateTime(sessionGroup.dateExpires)}
        />
        <Fact label="Device" value={summary.device} />
        <Fact label="Browser" value={summary.browser} />
        <Fact label="Time zone" value={summary.timezone} />
        <Fact label="Connection" value={summary.transport} />
      </dl>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">
          Approval history
        </p>
        <ol className="space-y-2" aria-label={`Approval history for ${summary.title}`}>
          {sessionGroup.bundles.map((bundle) => {
            const rows = groupGrantAccess(bundle.grants);
            return (
              <li
                key={bundle.id}
                aria-label={`Approval on ${formatDateTime(bundle.dateGranted)}`}
                className="rounded-lg border border-border-subtle bg-surface-1 px-3 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="font-medium text-text-secondary">{formatDateTime(bundle.dateGranted)}</span>
                  <Badge tone={bundle.active ? 'success' : 'neutral'}>
                    {bundle.active ? 'Active' : 'Expired'}
                  </Badge>
                  <span className="ml-auto text-text-ghost">
                    {bundle.active ? 'Until' : 'Ended'} {formatDateTime(bundle.dateExpires)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {rows.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs text-text-primary" title={row.module}>{accessRowName(row)}</span>
                      {(row.modulePath || row.contextId) && (
                        <span className="text-[11px] text-text-ghost">{accessRowDetail(row, undefined)}</span>
                      )}
                      <PermissionActionChips actions={row.actions} />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">
          Technical details
        </p>
        <dl className="grid gap-1.5 text-xs">
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="text-text-ghost">Delegate DID</dt>
            <dd className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-text-secondary" title={sessionGroup.grantee}>
                {truncateDid(sessionGroup.grantee)}
              </span>
              <CopyButton value={sessionGroup.grantee} label="Copy delegate DID" />
            </dd>
          </div>
          {summary.technicalDetails.map((detail) => (
            <div key={detail.label} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
              <dt className="text-text-ghost">{detail.label}</dt>
              <dd className="min-w-0 break-words font-mono text-text-secondary">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function SessionRow({
  sessionGroup,
  applicationName,
  onRevoke,
  onRenew,
}: {
  sessionGroup: PermissionSessionGroup;
  applicationName: string;
  onRevoke: (session: PermissionSessionGroup) => void;
  onRenew: (session: PermissionSessionGroup) => void;
}) {
  const summary = describeConnectSession(sessionGroup.session);
  const headingId = useId();
  const status = sessionGroup.active
    ? `Expires ${formatRelativeExpiry(sessionGroup.dateExpires)}`
    : `Expired ${formatRelativeExpiry(sessionGroup.dateExpires)}`;
  const approved = sessionGroup.dateGranted
    ? `approved ${formatRelativeExpiry(sessionGroup.dateGranted)}`
    : undefined;

  return (
    <li
      aria-labelledby={headingId}
      className={cn(
        'rounded-lg border border-border-subtle bg-surface-0/40',
        !sessionGroup.active && 'bg-transparent',
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2',
            sessionGroup.active ? 'text-text-secondary' : 'text-text-ghost',
          )}
        >
          <DeviceIcon summary={summary} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h5
              id={headingId}
              className={cn(
                'truncate text-sm font-medium',
                sessionGroup.active ? 'text-text-primary' : 'text-text-tertiary',
              )}
            >
              {summary.title}
            </h5>
            {sessionGroup.active && (
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-label="Active" role="img" />
            )}
          </div>
          <p className="truncate text-xs text-text-tertiary">
            {[status, approved].filter(Boolean).join(' · ')}
          </p>
        </div>
        {sessionGroup.active ? (
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => onRevoke(sessionGroup)}
            className="shrink-0"
            aria-label={`Revoke ${summary.title} session for ${applicationName}`}
          >
            Revoke
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRenew(sessionGroup)}
            className="shrink-0"
            aria-label={`Renew ${summary.title} session for ${applicationName}`}
            title="Renew access"
          >
            <RefreshCw className="size-3.5" />
            Renew
          </Button>
        )}
      </div>
      <Disclosure
        className="border-t border-border-subtle"
        summaryClassName="px-3 py-2 text-text-tertiary hover:text-text-primary"
        summary="Details"
        contentClassName="px-3 pb-3 pt-1"
      >
        <SessionDetails sessionGroup={sessionGroup} summary={summary} />
      </Disclosure>
    </li>
  );
}

// ── Application card ────────────────────────────────────────────────

function TrustLabel({ trust }: { trust: PermissionApplicationGroup['identityTrust'] }) {
  return trust === 'verified-origin' ? (
    <span className="inline-flex items-center gap-1 text-success">
      <ShieldCheck className="size-3.5" aria-hidden="true" />
      Website origin verified
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-warning">
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      App identity not verified by wallet
    </span>
  );
}

function ApplicationCard({
  application,
  onRevoke,
  onRenewSession,
}: {
  application: PermissionApplicationGroup;
  onRevoke: (target: RevokeTarget) => void;
  onRenewSession: (session: PermissionSessionGroup) => void;
}) {
  const headingId = useId();
  const [showAllExpired, setShowAllExpired] = useState(false);
  const activeSessions = application.sessions.filter((session) => session.active);
  // Most recently expired first, so the rows read as a rewind of usage.
  const expiredSessions = [...application.sessions.filter((session) => !session.active)]
    .sort((left, right) => right.dateExpires.localeCompare(left.dateExpires));
  const visibleExpiredSessions = showAllExpired
    ? expiredSessions
    : expiredSessions.slice(0, MAX_VISIBLE_EXPIRED_SESSIONS);
  const isActive = activeSessions.length > 0;

  // What the app can do now (active sessions), or could do before it expired.
  const accessRows = groupGrantAccess(
    isActive
      ? activeSessions.flatMap((session) => activeGrants(session.grants))
      : application.sessions.flatMap((session) => session.grants),
  );

  const host = hostOf(application.origin);
  const showOrigin = host !== undefined && host !== application.name;
  const showAppId = application.applicationId !== undefined
    && application.applicationId !== application.name
    && application.applicationId !== application.origin;
  const latestExpiry = application.sessions
    .map((session) => session.dateExpires)
    .sort()
    .at(-1);

  const status = isActive
    ? `${pluralize(activeSessions.length, 'device')} connected`
    : latestExpiry ? `Access expired ${formatRelativeExpiry(latestExpiry)}` : 'Access expired';

  const revokeAll = (): void => onRevoke({
    title   : `Disconnect ${application.name}?`,
    body    : (
      <>
        <strong className="text-text-primary">{application.name}</strong> will immediately lose
        access to this profile on {pluralize(activeSessions.length, 'device')}. You can connect it
        again later.
      </>
    ),
    confirm : 'Disconnect',
    success : `${application.name} disconnected`,
    grants  : activeSessions.flatMap((session) => session.grants),
  });

  const revokeRow = (row: GrantAccessRow): void => {
    const name = accessRowName(row);
    const verbs = formatList(row.actions.filter((action) => action.kind === 'record').map((action) => action.phrase));
    onRevoke({
      title   : `Remove ${name} access?`,
      body    : (
        <>
          <strong className="text-text-primary">{application.name}</strong> will no longer be able
          to {verbs || 'use'} your {name} data on any device. Other access stays as it is.
        </>
      ),
      confirm : 'Remove access',
      success : 'Permission revoked',
      grants  : row.grants,
    });
  };

  return (
    <article
      aria-labelledby={headingId}
      className="surface-card overflow-hidden rounded-xl border border-border-default bg-surface-1"
    >
      <header className="flex items-start gap-3 p-4 sm:p-5">
        <Monogram label={application.name} seed={application.origin ?? application.id} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h4 id={headingId} className="truncate text-base font-semibold text-text-primary">
              {application.name}
            </h4>
            <Badge tone={isActive ? 'success' : 'neutral'}>{isActive ? 'Active' : 'Expired'}</Badge>
          </div>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
            {showOrigin && <span className="truncate" title={application.origin}>{host}</span>}
            <TrustLabel trust={application.identityTrust} />
          </p>
          {showAppId && (
            <p className="mt-1 truncate font-mono text-[11px] text-text-ghost" title={application.applicationId}>
              App ID: {application.applicationId}
            </p>
          )}
          <p className="mt-1 text-xs text-text-ghost">{status}</p>
        </div>
        {isActive && (
          <Button
            variant="secondary"
            size="sm"
            onClick={revokeAll}
            className="shrink-0"
            aria-label={`Disconnect ${application.name}`}
          >
            Disconnect
          </Button>
        )}
      </header>

      <div className="space-y-2 border-t border-border-subtle px-4 py-4 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">
          {isActive ? 'Can access' : 'Had access to'}
        </p>
        <AccessList
          rows={accessRows}
          label={`${application.name} data access`}
          onRevokeRow={isActive ? revokeRow : undefined}
          revokeLabel={(row) => `Revoke ${application.name} access to ${accessRowName(row)}`}
        />
      </div>

      <div className="space-y-2 border-t border-border-subtle px-4 py-4 sm:px-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Devices</p>
        <ul className="space-y-2" aria-label={`Devices for ${application.name}`}>
          {[...activeSessions, ...visibleExpiredSessions].map((sessionGroup) => (
            <SessionRow
              key={`${sessionGroup.grantee}:${sessionGroup.id}`}
              sessionGroup={sessionGroup}
              applicationName={application.name}
              onRenew={onRenewSession}
              onRevoke={(session) => {
                const title = describeConnectSession(session.session).title;
                onRevoke({
                  title   : 'Revoke session',
                  body    : (
                    <>
                      Sign <strong className="text-text-primary">{application.name}</strong> out
                      of {title}? It loses every active permission from this device&apos;s approval
                      history. Other devices keep their access.
                    </>
                  ),
                  confirm : 'Revoke session',
                  success : 'Session revoked',
                  grants  : session.grants,
                });
              }}
            />
          ))}
        </ul>

        {expiredSessions.length > MAX_VISIBLE_EXPIRED_SESSIONS && (
          <button
            type="button"
            onClick={() => setShowAllExpired((value) => !value)}
            aria-expanded={showAllExpired}
            className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', showAllExpired && 'rotate-180')}
            />
            {showAllExpired
              ? 'Show fewer expired sessions'
              : `Show all ${expiredSessions.length} expired sessions`}
          </button>
        )}
      </div>
    </article>
  );
}

// ── Grants created outside Connect ──────────────────────────────────

function StandaloneGroupCard({
  group,
  onRevoke,
}: {
  group: PermissionGranteeGroup;
  onRevoke: (target: RevokeTarget) => void;
}) {
  const rows = groupGrantAccess(group.grants);
  const label = truncateDid(group.grantee);

  return (
    <article
      aria-label={`Grants to ${label}`}
      className="surface-card overflow-hidden rounded-xl border border-border-default bg-surface-1"
    >
      <header className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <Monogram label={group.grantee.replace(/^did:[^:]+:/, '')} seed={group.grantee} icon={<Shield />} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-sm text-text-primary" title={group.grantee}>{label}</span>
            <CopyButton value={group.grantee} label="Copy DID" />
          </div>
          <p className="text-xs text-text-ghost">Granted outside an app connection</p>
        </div>
      </header>
      <div className="border-t border-border-subtle px-4 py-4 sm:px-5">
        <AccessList
          rows={rows}
          label={`Access granted to ${label}`}
          onRevokeRow={(row) => onRevoke({
            title   : 'Revoke permission',
            body    : `Revoke ${label}'s access to ${accessRowName(row)}? It will no longer be able to access this data.`,
            confirm : 'Revoke',
            success : 'Permission revoked',
            grants  : row.grants,
          })}
          revokeLabel={(row) => `Revoke ${accessRowName(row)} permission`}
        />
      </div>
    </article>
  );
}

// ── Tab ─────────────────────────────────────────────────────────────

export default function PermissionsTab({ did }: PermissionsTabProps) {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const { data: permissions, isLoading, isError, error } = usePermissions(did);
  const { data: modules } = useModules(did);
  const definitions = useMemo(
    () => new Map((modules ?? []).map((module) => [module.uri, module.definition as DwnModuleDefinition])),
    [modules],
  );
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [renewTarget, setRenewTarget] = useState<RenewTarget | null>(null);
  // Keep the last dialog copy on screen while the dialog animates closed.
  const lastRevokeTarget = useRef<RevokeTarget | null>(null);
  const lastRenewTarget = useRef<RenewTarget | null>(null);
  if (revokeTarget) lastRevokeTarget.current = revokeTarget;
  if (renewTarget) lastRenewTarget.current = renewTarget;
  const shownRevoke = revokeTarget ?? lastRevokeTarget.current;
  const shownRenew = renewTarget ?? lastRenewTarget.current;
  const [renewing, setRenewing] = useState(false);
  const connectedHeadingId = useId();
  const pastHeadingId = useId();
  const otherHeadingId = useId();

  const { applications, standaloneGroups } = useMemo(
    () => buildPermissionSections(permissions),
    [permissions],
  );
  const connectedApps = applications.filter((application) => application.activeSessionCount > 0);
  const pastApps = applications.filter((application) => application.activeSessionCount === 0);

  if (isLoading) {
    return <Loader message="Loading permissions..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  const isEmpty = applications.length === 0 && standaloneGroups.length === 0;

  const invalidate = (): Promise<unknown> => Promise.allSettled([
    queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissions(did) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissionHistory(did) }),
  ]);

  const handleRevoke = async (): Promise<void> => {
    if (!revokeTarget) return;
    const grants = activeGrants(revokeTarget.grants);
    if (grants.length === 0) {
      toast.error('This access has already ended.');
      setRevokeTarget(null);
      return;
    }
    setRevoking(true);
    try {
      if (agent === null) {
        throw new Error('Unlock the wallet before revoking permissions.');
      }
      const results = await Promise.allSettled(grants.map(async (grant) =>
        agent.permissions.createRevocation({
          author : did,
          grant,
          store  : true,
        })));

      const revokedCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedResults = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );

      if (revokedCount > 0) {
        await invalidate();
        setRevokeTarget(null);

        if (failedResults.length > 0) {
          toast.error(
            `Revoked ${revokedCount} of ${grants.length} permissions. `
            + `${failedResults.length} could not be revoked; try again.`,
          );
        } else {
          toast.success(revokeTarget.success);
        }
        return;
      }

      const firstFailure = failedResults[0]?.reason;
      throw firstFailure instanceof Error
        ? firstFailure
        : new Error('Failed to revoke permission');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke permission');
    } finally {
      setRevoking(false);
    }
  };

  const handleRenew = async (): Promise<void> => {
    if (!renewTarget) return;
    setRenewing(true);
    try {
      if (agent === null) {
        throw new Error('Unlock the wallet before renewing access.');
      }
      await renewExpiredSession(agent, did, renewTarget.session);
      await invalidate();
      toast.success(
        `${renewTarget.applicationName} access renewed — the app picks it up on its next sync.`,
      );
      setRenewTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to renew access');
    } finally {
      setRenewing(false);
    }
  };

  const standaloneGrantCount = standaloneGroups.reduce(
    (sum, group) => sum + group.grants.length,
    0,
  );

  const renderApplication = (application: PermissionApplicationGroup): ReactNode => (
    <ApplicationCard
      key={application.id}
      application={application}
      onRevoke={setRevokeTarget}
      onRenewSession={(session) => setRenewTarget({ applicationName: application.name, session })}
    />
  );

  return (
    <ModuleDefinitionsContext.Provider value={definitions}>
      <div className="space-y-8">
        {isEmpty && (
          <EmptyState
            icon={<Shield />}
            title="No connected apps"
            description="When you approve an app, it appears here with exactly what it can access. You can revoke access at any time."
          />
        )}

        {connectedApps.length > 0 && (
          <section className="space-y-3" aria-labelledby={connectedHeadingId}>
            <SectionHeader
              id={connectedHeadingId}
              title="Connected apps"
              count={connectedApps.length}
              description="Apps that can access this profile right now."
            />
            {connectedApps.map(renderApplication)}
          </section>
        )}

        {pastApps.length > 0 && (
          <section className="space-y-3" aria-labelledby={pastHeadingId}>
            <SectionHeader
              id={pastHeadingId}
              title="Past connections"
              count={pastApps.length}
              description="Their access has expired. Renew a device to restore it."
            />
            {pastApps.map(renderApplication)}
          </section>
        )}

        {standaloneGroups.length > 0 && (
          <section className="space-y-3" aria-labelledby={otherHeadingId}>
            <SectionHeader
              id={otherHeadingId}
              title="Other permissions"
              count={standaloneGrantCount}
              description="Grants created directly rather than through an app connection."
            />
            {standaloneGroups.map((group) => (
              <StandaloneGroupCard key={group.grantee} group={group} onRevoke={setRevokeTarget} />
            ))}
          </section>
        )}

        <Dialog
          open={!!renewTarget}
          onClose={() => !renewing && setRenewTarget(null)}
          title="Renew access"
        >
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-text-secondary">
              Give <strong className="text-text-primary">{shownRenew?.applicationName}</strong> access
              on this device for another {formatConnectSessionDuration(CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS)},
              with the same permissions it had before? The app picks up its new access on its
              next sync.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRenewTarget(null)} disabled={renewing}>
                Cancel
              </Button>
              <Button onClick={handleRenew} loading={renewing}>
                <RefreshCw className="size-4" />
                Renew access
              </Button>
            </div>
          </div>
        </Dialog>

        <Dialog
          open={!!revokeTarget}
          onClose={() => !revoking && setRevokeTarget(null)}
          title={shownRevoke?.title}
        >
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-text-secondary">{shownRevoke?.body}</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoking}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRevoke} loading={revoking}>
                {shownRevoke?.confirm}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </ModuleDefinitionsContext.Provider>
  );
}
