import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Info,
  Languages,
  Globe2,
  MapPin,
  MonitorSmartphone,
  Power,
  Shield,
  Trash2,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { queryKeys } from '@/enbox/queries/query-keys';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { truncateDid, copyToClipboard } from '@/lib/utils';
import { getProtocolName, getScopeLabel } from '@/lib/protocol-names';
import type { PermissionGrant } from '@enbox/api';
import {
  buildPermissionSections,
  type PermissionGranteeGroup,
  type PermissionSessionGroup,
} from './permission-sessions';
import { describeConnectSession, sessionTitle } from './permission-session-display';

interface PermissionsTabProps {
  did: string;
}

type RevokeTarget =
  | { kind: 'grant'; grant: PermissionGrant }
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

function grantScopeLabel(grant: PermissionGrant): string | undefined {
  const scopeInterface = grant.scope?.interface;
  const method = grant.scope?.method;
  if (!scopeInterface) return undefined;
  if (!method) return scopeInterface;
  return getScopeLabel({ interface: scopeInterface, method });
}

function revokeTargetGrants(target: RevokeTarget): PermissionGrant[] {
  return target.kind === 'session' ? target.session.grants : [target.grant];
}

function revokeDialogCopy(target: RevokeTarget | null): {
  title: string;
  body: string;
  confirm: string;
} {
  if (target?.kind === 'session') {
    return {
      title   : 'Revoke session',
      body    : 'Revoke this connect session? The app will lose every permission granted in this session.',
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
  grant: PermissionGrant;
  onRevoke: (grant: PermissionGrant) => void;
}) {
  const protocol = grant.scope?.protocol;
  const scopeLabel = grantScopeLabel(grant);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
      <span
        className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary"
        title={protocol}
      >
        {protocol ? getProtocolName(protocol) : 'All protocols'}
      </span>
      {scopeLabel && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
          {scopeLabel}
        </span>
      )}
      <button
        type="button"
        onClick={() => onRevoke(grant)}
        className="ml-auto inline-flex items-center justify-center rounded-md p-1 text-text-ghost transition-colors hover:bg-error/10 hover:text-error"
        aria-label="Revoke permission"
        title="Revoke"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
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

function SessionCard({
  sessionGroup,
  copiedDid,
  onCopy,
  onRevokeGrant,
  onRevokeSession,
}: {
  sessionGroup: PermissionSessionGroup;
  copiedDid: string | null;
  onCopy: (did: string) => void;
  onRevokeGrant: (grant: PermissionGrant) => void;
  onRevokeSession: (session: PermissionSessionGroup) => void;
}) {
  const summary = describeConnectSession(sessionGroup.session);

  return (
    <div className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <MonitorSmartphone className="h-4 w-4 shrink-0 text-accent" />
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {sessionTitle(sessionGroup)}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                sessionGroup.active
                  ? 'bg-success/10 text-success'
                  : 'bg-surface-3 text-text-ghost'
              }`}
            >
              {sessionGroup.active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {sessionGroup.session.origin && (
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
              <Globe2 className="h-3.5 w-3.5 shrink-0 text-text-ghost" />
              <span className="truncate" title={sessionGroup.session.origin}>
                {sessionGroup.session.origin}
              </span>
            </div>
          )}

          <div className="grid gap-1 sm:grid-cols-2">
            <SessionMetadataItem
              icon={<MonitorSmartphone className="h-3.5 w-3.5" />}
              label="Device"
              value={summary.title}
            />
            <SessionMetadataItem
              icon={<MapPin className="h-3.5 w-3.5" />}
              label="Timezone"
              value={summary.timezone}
            />
            <SessionMetadataItem
              icon={<Globe2 className="h-3.5 w-3.5" />}
              label="Transport"
              value={summary.transport}
            />
            <SessionMetadataItem
              icon={<Languages className="h-3.5 w-3.5" />}
              label="Language"
              value={summary.language}
            />
          </div>

          <div className="flex min-w-0 items-center gap-1.5 text-xs text-text-ghost">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-mono" title={sessionGroup.grantee}>
              {truncateDid(sessionGroup.grantee)}
            </span>
            <CopyDidButton
              did={sessionGroup.grantee}
              copiedDid={copiedDid}
              onCopy={onCopy}
              label="Copy delegate DID"
            />
          </div>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRevokeSession(sessionGroup)}
          className="shrink-0"
        >
          <Power className="h-3.5 w-3.5" />
          Revoke
        </Button>
      </div>

      <div className="mb-3 grid gap-2 text-xs text-text-ghost sm:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          <span>Approved {formatDateTime(sessionGroup.dateGranted)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          <span>
            {sessionGroup.active ? 'Expires' : 'Expired'} {formatDateTime(sessionGroup.dateExpires)}
          </span>
        </div>
      </div>

      {summary.technicalDetails.length > 0 && (
        <details className="group mb-3 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-text-secondary hover:text-text-primary">
            <span className="inline-flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Session details
            </span>
            <ChevronDown className="h-4 w-4 text-text-ghost transition-transform group-open:rotate-180" />
          </summary>

          <dl className="mt-2 grid gap-2 text-xs">
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
      )}

      <div className="space-y-2">
        {sessionGroup.grants.map((grant, index) => (
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

function StandaloneGroupCard({
  group,
  copiedDid,
  onCopy,
  onRevokeGrant,
}: {
  group: PermissionGranteeGroup;
  copiedDid: string | null;
  onCopy: (did: string) => void;
  onRevokeGrant: (grant: PermissionGrant) => void;
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
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <span className="text-xs text-text-ghost">{grantCountLabel(count)}</span>
    </div>
  );
}

export default function PermissionsTab({ did }: PermissionsTabProps) {
  const queryClient = useQueryClient();
  const { data: permissions, isLoading, isError, error } = usePermissions(did);
  const [copiedDid, setCopiedDid] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const [revoking, setRevoking] = useState(false);

  const {
    activeSessions,
    inactiveSessions,
    standaloneGroups,
  } = useMemo(() => buildPermissionSections(permissions), [permissions]);

  if (isLoading) {
    return <Loader message="Loading permissions..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  const isEmpty = activeSessions.length === 0
    && inactiveSessions.length === 0
    && standaloneGroups.length === 0;

  if (isEmpty) {
    return (
      <EmptyState
        icon={<Shield />}
        title="No permissions granted"
        description="Permission grants from apps and services will appear here."
      />
    );
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const grants = revokeTargetGrants(revokeTarget);
    setRevoking(true);
    try {
      await Promise.all(grants.map((grant) => grant.revoke()));
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.permissions(did) });
      toast.success(revokeTarget.kind === 'session' ? 'Session revoked' : 'Permission revoked');
      setRevokeTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke permission');
    } finally {
      setRevoking(false);
    }
  };

  const handleCopy = async (value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedDid(value);
      setTimeout(() => setCopiedDid(null), 2000);
    }
  };

  const dialogCopy = revokeDialogCopy(revokeTarget);
  const activeGrantCount = activeSessions.reduce(
    (sum, session) => sum + session.grants.length,
    0,
  );
  const inactiveGrantCount = inactiveSessions.reduce(
    (sum, session) => sum + session.grants.length,
    0,
  );
  const standaloneGrantCount = standaloneGroups.reduce(
    (sum, group) => sum + group.grants.length,
    0,
  );

  return (
    <div className="space-y-6">
      {activeSessions.length > 0 && (
        <section className="space-y-3" aria-label="Active connect sessions">
          <SectionHeader title="Active Sessions" count={activeGrantCount} />
          {activeSessions.map((sessionGroup) => (
            <SessionCard
              key={sessionGroup.id}
              sessionGroup={sessionGroup}
              copiedDid={copiedDid}
              onCopy={handleCopy}
              onRevokeGrant={(grant) => setRevokeTarget({ kind: 'grant', grant })}
              onRevokeSession={(session) => setRevokeTarget({ kind: 'session', session })}
            />
          ))}
        </section>
      )}

      {inactiveSessions.length > 0 && (
        <section className="space-y-3" aria-label="Inactive permission bundles">
          <SectionHeader title="Inactive Permission Bundles" count={inactiveGrantCount} />
          {inactiveSessions.map((sessionGroup) => (
            <SessionCard
              key={sessionGroup.id}
              sessionGroup={sessionGroup}
              copiedDid={copiedDid}
              onCopy={handleCopy}
              onRevokeGrant={(grant) => setRevokeTarget({ kind: 'grant', grant })}
              onRevokeSession={(session) => setRevokeTarget({ kind: 'session', session })}
            />
          ))}
        </section>
      )}

      {standaloneGroups.length > 0 && (
        <section className="space-y-3" aria-label="Other permissions">
          <SectionHeader title="Other Permissions" count={standaloneGrantCount} />
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
