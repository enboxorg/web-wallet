import {
  areReplicationLinksCurrent,
  type LinkStatus,
  type RemoteSyncState,
  type RemoteSyncStatus,
  type ReplicationLinkSnapshot,
} from '@enbox/agent';

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Loader } from '@/components/ui/Loader';
import {
  useLiveSyncStatus,
  useRetryRemoteSync,
} from '@/enbox/hooks/use-live-sync-status';

interface RemoteSyncStatusPanelProps {
  did: string;
}

const STATE_LABELS: Record<RemoteSyncState, string> = {
  healthy         : 'Healthy',
  'quota-blocked' : 'Quota blocked',
  degraded        : 'Needs attention',
  offline         : 'Offline',
};

const STATE_CLASSES: Record<RemoteSyncState, string> = {
  healthy         : 'bg-success/10 text-success',
  'quota-blocked' : 'bg-warning/10 text-warning',
  degraded        : 'bg-error/10 text-error',
  offline         : 'bg-surface-3 text-text-secondary',
};

const LINK_STATUS_LABELS: Record<LinkStatus, string> = {
  initializing : 'Catching up',
  live         : 'Live',
  repairing    : 'Repairing',
  paused       : 'Paused',
};

const LINK_STATUS_CLASSES: Record<LinkStatus, string> = {
  initializing : 'text-accent',
  live         : 'text-success',
  repairing    : 'text-warning',
  paused       : 'text-error',
};

function StatusIcon({ state }: { state: RemoteSyncState }) {
  if (state === 'healthy') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (state === 'offline') {
    return <CloudOff className="h-4 w-4 text-text-tertiary" />;
  }
  return <AlertTriangle className={`h-4 w-4 ${state === 'quota-blocked' ? 'text-warning' : 'text-error'}`} />;
}

function formatTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle : 'medium',
    timeStyle : 'short',
  }).format(date);
}

function remoteDetail(status: RemoteSyncStatus): string {
  if (status.state === 'quota-blocked') {
    const count = status.quotaBlockedMessageCount;
    return `${count} ${count === 1 ? 'message is' : 'messages are'} waiting for remote quota.`;
  }
  if (status.failedMessageCount > 0) {
    const count = status.failedMessageCount;
    return `${count} ${count === 1 ? 'message needs' : 'messages need'} attention.`;
  }
  if (status.state === 'offline') {
    return 'The sync engine cannot currently reach this remote.';
  }
  return 'Replication is operating normally.';
}

function linkScopeLabel(link: ReplicationLinkSnapshot): string {
  if (link.scope.kind === 'full') {
    return 'All protocols';
  }
  if (link.scope.kind === 'context') {
    return 'Shared context';
  }
  const count = link.scope.protocols.length;
  return `${count} ${count === 1 ? 'protocol' : 'protocols'}`;
}

function linkScopeDetail(link: ReplicationLinkSnapshot): string | undefined {
  if (link.scope.kind === 'full') {
    return undefined;
  }
  return link.scope.kind === 'context'
    ? `${link.scope.protocol}\n${link.scope.contextId}`
    : link.scope.protocols.join('\n');
}

function linkKey(link: ReplicationLinkSnapshot): string {
  const scope = link.scope.kind === 'full'
    ? 'all'
    : link.scope.kind === 'context'
      ? `${link.scope.protocol}:${link.scope.contextId}`
      : link.scope.protocols.join('|');
  return `${link.remoteEndpoint}:${link.delegateDid ?? 'owner'}:${scope}`;
}

function caughtUpLabel(links: ReplicationLinkSnapshot[]): string {
  if (links.length === 0) {
    return 'Preparing replication links';
  }
  const currentCount = links.filter((link) => areReplicationLinksCurrent([link])).length;
  const linkLabel = links.length === 1 ? 'replication link' : 'replication links';
  if (currentCount === links.length) {
    return links.length === 1 ? 'Replication link caught up' : 'All replication links caught up';
  }
  return `${currentCount} of ${links.length} ${linkLabel} caught up`;
}

export function RemoteSyncStatusPanel({ did }: RemoteSyncStatusPanelProps) {
  const { links, remotes } = useLiveSyncStatus(did);
  const retryRemote = useRetryRemoteSync(did);
  const isLoading = links.isLoading || remotes.isLoading;
  const error = links.error ?? remotes.error;

  async function handleRetry(remoteEndpoint: string): Promise<void> {
    try {
      await retryRemote.mutateAsync(remoteEndpoint);
      toast.success('Remote sync retry started');
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : 'Failed to retry remote sync');
    }
  }

  return (
    <section className="space-y-3" aria-label="Remote sync status">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-text-primary">Remote sync</h3>
      </div>

      {isLoading && <Loader message="Loading remote sync status..." />}
      {error && (
        <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load remote sync status'} />
      )}
      {!isLoading && !error && remotes.data?.length === 0 && (
        <div className="rounded-lg border border-border-default bg-surface-1 px-4 py-3 text-sm text-text-tertiary">
          No active remote sync links yet.
        </div>
      )}

      {!error && remotes.data?.map((remote) => {
        const nextProbe = formatTimestamp(remote.nextProbeAt);
        const lastActivity = formatTimestamp(remote.lastActivityAt);
        const retrying = retryRemote.isPending && retryRemote.variables === remote.remoteEndpoint;
        const remoteLinks = links.data?.filter(
          ({ remoteEndpoint }) => remoteEndpoint === remote.remoteEndpoint,
        ) ?? [];

        return (
          <div
            key={remote.remoteEndpoint}
            className="rounded-lg border border-border-default bg-surface-1 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <StatusIcon state={remote.state} />
                  <code className="truncate text-xs text-text-primary" title={remote.remoteEndpoint}>
                    {remote.remoteEndpoint}
                  </code>
                </div>
                <p className="mt-2 text-xs text-text-secondary">{remoteDetail(remote)}</p>
                {remote.lastError && (
                  <p className="mt-1 break-words text-xs text-error">{remote.lastError}</p>
                )}
                <div className="mt-3 rounded-md border border-border-subtle bg-surface-2 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-text-secondary">Live sync</span>
                    <span className="text-[11px] text-text-ghost" aria-live="polite">
                      {caughtUpLabel(remoteLinks)}
                    </span>
                  </div>
                  {remoteLinks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" aria-label={`Live sync links for ${remote.remoteEndpoint}`}>
                      {remoteLinks.map((link) => (
                        <span
                          key={linkKey(link)}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-1 px-2 py-1 text-[11px]"
                          title={linkScopeDetail(link)}
                        >
                          <span className="text-text-tertiary">{linkScopeLabel(link)}</span>
                          <span className={`font-medium ${LINK_STATUS_CLASSES[link.status]}`}>
                            {LINK_STATUS_LABELS[link.status]}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-ghost">
                  {nextProbe && <span>Next automatic retry: {nextProbe}</span>}
                  {lastActivity && <span>Last activity: {lastActivity}</span>}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATE_CLASSES[remote.state]}`}>
                  {STATE_LABELS[remote.state]}
                </span>
                {remote.state === 'quota-blocked' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={retrying}
                    disabled={retryRemote.isPending && !retrying}
                    onClick={() => handleRetry(remote.remoteEndpoint)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry now
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
