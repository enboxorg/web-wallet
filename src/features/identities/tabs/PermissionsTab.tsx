import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Globe2,
  Info,
  MonitorSmartphone,
  Power,
  Shield,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { queryKeys } from '@/enbox/queries/query-keys';
import { useAuthStore } from '@/stores/auth-store';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { truncateDid, copyToClipboard } from '@/lib/utils';
import { getProtocolName, getScopeLabel } from '@/lib/protocol-names';
import type { DwnPermissionGrant } from '@enbox/agent';
import {
  buildPermissionSections,
  type PermissionApprovalBundle,
  type PermissionApplicationGroup,
  type PermissionGranteeGroup,
  type PermissionSessionGroup,
} from './permission-sessions';
import { describeConnectSession } from './permission-session-display';

interface PermissionsTabProps {
  did: string;
}

type RevokeTarget =
  | { kind: 'grant'; grant: DwnPermissionGrant }
  | { kind: 'session'; session: PermissionSessionGroup };

function formatDateTime(value: string | undefined): string {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle : 'medium',
    timeStyle : 'short',
  }).format(date);
}

function grantCountLabel(count: number): string {
  return count === 1 ? '1 permission' : `${count} permissions`;
}

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 session' : `${count} sessions`;
}

function applicationCountLabel(count: number): string {
  return count === 1 ? '1 app' : `${count} apps`;
}

function grantScopeLabel(grant: DwnPermissionGrant): string | undefined {
  const scopeInterface = grant.scope?.interface;
  const method = grant.scope?.method;
  if (!scopeInterface) return undefined;
  if (!method) return scopeInterface;
  return getScopeLabel({ interface: scopeInterface, method });
}

function revokeTargetGrants(target: RevokeTarget): DwnPermissionGrant[] {
  return target.kind === 'session'
    ? target.session.grants.filter((grant) => {
      const expiresAt = new Date(grant.dateExpires).getTime();
      return Number.isFinite(expiresAt) && expiresAt > Date.now();
    })
    : [target.grant];
}

function revokeDialogCopy(target: RevokeTarget | null): {
  title: string;
  body: string;
  confirm: string;
} {
  if (target?.kind === 'session') {
    return {
      title   : 'Revoke session',
      body    : 'Revoke this session? The app will lose every active permission from its approval history on this device.',
      confirm : 'Revoke session',
    };
  }

  return {
    title   : 'Revoke permission',
    body    : 'Revoke this permission? The app will no longer be able to access this protocol.',
    confirm : 'Revoke',
  };
}

function PermissionGrantRow({
  grant,
  onRevoke,
}: {
  grant: DwnPermissionGrant;
  onRevoke?: (grant: DwnPermissionGrant) => void;
}) {
  const protocol = grant.scope?.protocol;
  const scopeLabel = grantScopeLabel(grant);
  const protocolLabel = protocol ? getProtocolName(protocol) : 'All protocols';
  const revokeLabel = scopeLabel
    ? `Revoke ${protocolLabel} ${scopeLabel} permission`
    : `Revoke ${protocolLabel} permission`;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary"
        title={protocol}
      >
        {protocolLabel}
      </span>
      {scopeLabel && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
          {scopeLabel}
        </span>
      )}
      {onRevoke && (
        <button
          type="button"
          onClick={() => onRevoke(grant)}
          className="ml-auto inline-flex items-center justify-center rounded-md p-1 text-text-ghost transition-colors hover:bg-error/10 hover:text-error"
          aria-label={revokeLabel}
          title="Revoke"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function CopyDidButton({
  did,
  copiedDid,
  onCopy,
  label,
}: {
  did: string;
  copiedDid: string | null;
  onCopy: (did: string) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(did)}
      className="text-text-ghost hover:text-text-secondary"
      aria-label={label}
      title={label}
    >
      {copiedDid === did ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function SessionMetadataItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | undefined;
}) {
  if (!value) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-ghost">
      <span className="shrink-0 text-text-ghost">{icon}</span>
      <span className="shrink-0 text-text-tertiary">{label}</span>
      <span className="truncate text-text-secondary" title={value}>{value}</span>
    </div>
  );
}

function isGrantActive(grant: DwnPermissionGrant): boolean {
  const expiresAt = new Date(grant.dateExpires).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function ApprovalBundleDisclosure({
  bundle,
  onRevokeGrant,
}: {
  bundle: PermissionApprovalBundle;
  onRevokeGrant: (grant: DwnPermissionGrant) => void;
}) {
  const approvedAt = formatDateTime(bundle.dateGranted);

  return (
    <details
      aria-label={`Permission bundle approved ${approvedAt}`}
      className="group rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-3 py-2"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-text-secondary hover:text-text-primary">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Permission bundle · {approvedAt}</span>
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            bundle.active
              ? 'bg-success/10 text-success'
              : 'bg-surface-3 text-text-ghost'
          }`}
        >
          {bundle.active ? 'Active' : 'Expired'}
        </span>
        <span className="ml-auto text-text-ghost">
          {grantCountLabel(bundle.grants.length)}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-ghost transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-2 space-y-2">
        <p className="text-xs text-text-ghost">
          Access expires {formatDateTime(bundle.dateExpires)}
        </p>
        {bundle.grants.map((grant, index) => (
          <PermissionGrantRow
            key={grant.id ?? index}
            grant={grant}
            onRevoke={isGrantActive(grant) ? onRevokeGrant : undefined}
          />
        ))}
      </div>
    </details>
  );
}

function SessionCard({
  sessionGroup,
  applicationName,
  copiedDid,
  onCopy,
  onRevokeGrant,
  onRevokeSession,
}: {
  sessionGroup: PermissionSessionGroup;
  applicationName: string;
  copiedDid: string | null;
  onCopy: (did: string) => void;
  onRevokeGrant: (grant: DwnPermissionGrant) => void;
  onRevokeSession: (session: PermissionSessionGroup) => void;
}) {
  const summary = describeConnectSession(sessionGroup.session);
  const headingId = useId();
  const revokeSessionLabel = `Revoke ${summary.title} session for ${applicationName}`;

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-[var(--radius-lg)] border border-border-default bg-surface-2 p-4"
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <MonitorSmartphone className="h-4 w-4 shrink-0 text-accent" />
          <h5 id={headingId} className="truncate text-sm font-semibold text-text-primary">
            {summary.title}
          </h5>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              sessionGroup.active
                ? 'bg-success/10 text-success'
                : 'bg-surface-3 text-text-ghost'
            }`}
          >
            {sessionGroup.active ? 'Active' : 'Expired'}
          </span>
        </div>

        {sessionGroup.active && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onRevokeSession(sessionGroup)}
            className="shrink-0"
            aria-label={revokeSessionLabel}
          >
            <Power className="h-3.5 w-3.5" />
            Revoke session
          </Button>
        )}
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <SessionMetadataItem
          icon={<Clock3 className="h-3.5 w-3.5" />}
          label="Approved"
          value={formatDateTime(sessionGroup.dateGranted)}
        />
        {sessionGroup.bundles.length > 1 && (
          <SessionMetadataItem
            icon={<Clock3 className="h-3.5 w-3.5" />}
            label="Last renewed"
            value={formatDateTime(sessionGroup.lastRenewed)}
          />
        )}
        <SessionMetadataItem
          icon={<Clock3 className="h-3.5 w-3.5" />}
          label={sessionGroup.active ? 'Access available until' : 'Access expired'}
          value={formatDateTime(sessionGroup.dateExpires)}
        />
        <SessionMetadataItem
          icon={<MonitorSmartphone className="h-3.5 w-3.5" />}
          label="Device"
          value={summary.device}
        />
        <SessionMetadataItem
          icon={<Globe2 className="h-3.5 w-3.5" />}
          label="Browser"
          value={summary.browser}
        />
        <SessionMetadataItem
          icon={<Clock3 className="h-3.5 w-3.5" />}
          label="Time zone"
          value={summary.timezone}
        />
        <SessionMetadataItem
          icon={<Globe2 className="h-3.5 w-3.5" />}
          label="Transport"
          value={summary.transport}
        />
      </div>

      <details className="group mb-3 rounded-[var(--radius-md)] bg-surface-1 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-text-secondary hover:text-text-primary">
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Latest connection details
          </span>
          <ChevronDown className="h-4 w-4 text-text-ghost transition-transform group-open:rotate-180" />
        </summary>

        <dl className="mt-2 grid gap-2 text-xs">
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="text-text-ghost">Delegate DID</dt>
            <dd className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-mono text-text-secondary" title={sessionGroup.grantee}>
                {truncateDid(sessionGroup.grantee)}
              </span>
              <CopyDidButton
                did={sessionGroup.grantee}
                copiedDid={copiedDid}
                onCopy={onCopy}
                label="Copy delegate DID"
              />
            </dd>
          </div>
          {summary.technicalDetails.map((detail) => (
            <div key={detail.label} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
              <dt className="text-text-ghost">{detail.label}</dt>
              <dd className="min-w-0 break-words font-mono text-text-secondary">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      </details>

      <div className="space-y-2" aria-label={`Approval history for ${summary.title}`}>
        {sessionGroup.bundles.map((bundle) => (
          <ApprovalBundleDisclosure
            key={bundle.id}
            bundle={bundle}
            onRevokeGrant={onRevokeGrant}
          />
        ))}
      </div>
    </article>
  );
}

function ApplicationCard({
  application,
  copiedDid,
  onCopy,
  onRevokeGrant,
  onRevokeSession,
}: {
  application: PermissionApplicationGroup;
  copiedDid: string | null;
  onCopy: (did: string) => void;
  onRevokeGrant: (grant: DwnPermissionGrant) => void;
  onRevokeSession: (session: PermissionSessionGroup) => void;
}) {
  const headingId = useId();
  const activeLabel = application.activeSessionCount === 1
    ? '1 active'
    : `${application.activeSessionCount} active`;

  return (
    <article
      aria-labelledby={headingId}
      className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-2">
            <Globe2 className="h-4 w-4 shrink-0 text-accent" />
            <h4 id={headingId} className="truncate text-base font-semibold text-text-primary">
              {application.name}
            </h4>
          </div>

          {application.origin && application.origin !== application.name && (
            <p className="truncate text-xs text-text-secondary" title={application.origin}>
              {application.origin}
            </p>
          )}

          {application.applicationId && application.applicationId !== application.name && (
            <p className="truncate font-mono text-xs text-text-ghost" title={application.applicationId}>
              App ID: {application.applicationId}
            </p>
          )}

          <p
            className={`inline-flex items-center gap-1.5 text-xs ${
              application.identityTrust === 'verified-origin'
                ? 'text-success'
                : 'text-warning'
            }`}
          >
            {application.identityTrust === 'verified-origin' ? (
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {application.identityTrust === 'verified-origin'
              ? 'Website origin verified'
              : 'App identity not verified by wallet'}
          </p>
        </div>

        <span className="shrink-0 text-xs text-text-ghost">
          {sessionCountLabel(application.sessions.length)} · {activeLabel}
        </span>
      </div>

      <div className="space-y-3">
        {application.sessions.map((sessionGroup) => (
          <SessionCard
            key={`${sessionGroup.grantee}:${sessionGroup.id}`}
            sessionGroup={sessionGroup}
            applicationName={application.name}
            copiedDid={copiedDid}
            onCopy={onCopy}
            onRevokeGrant={onRevokeGrant}
            onRevokeSession={onRevokeSession}
          />
        ))}
      </div>
    </article>
  );
}

function StandaloneGroupCard({
  group,
  copiedDid,
  onCopy,
  onRevokeGrant,
}: {
  group: PermissionGranteeGroup;
  copiedDid: string | null;
  onCopy: (did: string) => void;
  onRevokeGrant: (grant: DwnPermissionGrant) => void;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Shield className="h-4 w-4 shrink-0 text-accent" />
        <span className="font-mono text-sm text-text-primary">
          {truncateDid(group.grantee)}
        </span>
        <CopyDidButton
          did={group.grantee}
          copiedDid={copiedDid}
          onCopy={onCopy}
          label="Copy DID"
        />
      </div>

      <div className="space-y-2">
        {group.grants.map((grant, index) => (
          <PermissionGrantRow
            key={grant.id ?? index}
            grant={grant}
            onRevoke={onRevokeGrant}
          />
        ))}
      </div>
    </div>
  );
}

function SectionHeader({
  id,
  title,
  countLabel,
}: {
  id: string;
  title: string;
  countLabel: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 id={id} className="text-sm font-semibold text-text-primary">{title}</h3>
      <span className="text-xs text-text-ghost">{countLabel}</span>
    </div>
  );
}

export default function PermissionsTab({ did }: PermissionsTabProps) {
  const agent = useAuthStore((state) => state.agent);
  const queryClient = useQueryClient();
  const { data: permissions, isLoading, isError, error } = usePermissions(did);
  const [copiedDid, setCopiedDid] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const connectedAppsHeadingId = useId();
  const otherPermissionsHeadingId = useId();

  const {
    applications,
    standaloneGroups,
  } = useMemo(() => buildPermissionSections(permissions), [permissions]);

  const inactiveSessionCount = applications.reduce(
    (sum, application) =>
      sum + application.sessions.filter((session) => !session.active).length,
    0,
  );

  // By default only apps that currently hold access are shown, and only
  // their active sessions — expired history stays behind the toggle.
  const visibleApplications = useMemo(
    () => showInactive
      ? applications
      : applications
        .filter((application) => application.activeSessionCount > 0)
        .map((application) => ({
          ...application,
          sessions: application.sessions.filter((session) => session.active),
        })),
    [applications, showInactive],
  );

  if (isLoading) {
    return <Loader message="Loading permissions..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  const isEmpty = applications.length === 0 && standaloneGroups.length === 0;

  const handleRevoke = async (): Promise<void> => {
    if (!revokeTarget) return;
    const grants = revokeTargetGrants(revokeTarget);
    if (grants.length === 0) {
      toast.error('This session no longer has active permissions.');
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
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissions(did) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissionHistory(did) }),
        ]);
        setRevokeTarget(null);

        if (failedResults.length > 0) {
          toast.error(
            `Revoked ${revokedCount} of ${grants.length} permissions. `
            + `${failedResults.length} could not be revoked; try again.`,
          );
        } else {
          toast.success(revokeTarget.kind === 'session' ? 'Session revoked' : 'Permission revoked');
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

  const handleCopy = async (value: string): Promise<void> => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedDid(value);
      setTimeout(() => setCopiedDid(null), 2000);
    }
  };

  const dialogCopy = revokeDialogCopy(revokeTarget);
  const standaloneGrantCount = standaloneGroups.reduce(
    (sum, group) => sum + group.grants.length,
    0,
  );

  return (
    <div className="space-y-6">
      {isEmpty && (
        <EmptyState
          icon={<Shield />}
          title="No permissions granted"
          description="Permission grants from apps and services will appear here."
        />
      )}

      {!isEmpty && visibleApplications.length === 0 && inactiveSessionCount > 0 && (
        <p className="text-xs text-text-ghost">
          No apps currently have access. Expired sessions are hidden below.
        </p>
      )}

      {visibleApplications.length > 0 && (
        <section className="space-y-3" aria-labelledby={connectedAppsHeadingId}>
          <SectionHeader
            id={connectedAppsHeadingId}
            title="Connected Apps"
            countLabel={applicationCountLabel(
              showInactive ? applications.length : visibleApplications.length,
            )}
          />
          {visibleApplications.map((application) => (
            <ApplicationCard
              key={application.id}
              application={application}
              copiedDid={copiedDid}
              onCopy={handleCopy}
              onRevokeGrant={(grant) => setRevokeTarget({ kind: 'grant', grant })}
              onRevokeSession={(session) => setRevokeTarget({ kind: 'session', session })}
            />
          ))}
        </section>
      )}

      {inactiveSessionCount > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowInactive((value) => !value)}
            aria-expanded={showInactive}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-text-tertiary transition-colors hover:text-text-primary"
          >
            <ChevronDown
              className={`h-4 w-4 text-text-ghost transition-transform ${showInactive ? 'rotate-180' : ''}`}
            />
            {showInactive
              ? 'Hide inactive sessions'
              : `Show inactive sessions (${inactiveSessionCount})`}
          </button>
        </div>
      )}

      {standaloneGroups.length > 0 && (
        <section className="space-y-3" aria-labelledby={otherPermissionsHeadingId}>
          <SectionHeader
            id={otherPermissionsHeadingId}
            title="Other Permissions"
            countLabel={grantCountLabel(standaloneGrantCount)}
          />
          {standaloneGroups.map((group) => (
            <StandaloneGroupCard
              key={group.grantee}
              group={group}
              copiedDid={copiedDid}
              onCopy={handleCopy}
              onRevokeGrant={(grant) => setRevokeTarget({ kind: 'grant', grant })}
            />
          ))}
        </section>
      )}

      <Dialog
        open={!!revokeTarget}
        onClose={() => !revoking && setRevokeTarget(null)}
        title={dialogCopy.title}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {dialogCopy.body}
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleRevoke}
              loading={revoking}
            >
              {dialogCopy.confirm}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
