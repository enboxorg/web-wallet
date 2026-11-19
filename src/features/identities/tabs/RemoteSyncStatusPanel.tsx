import {
  areReplicationLinksCurrent,
  type LinkStatus,
  type RemoteSyncState,
  type ReplicationLinkSnapshot,
} from '@enbox/agent';

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Disclosure';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Loader } from '@/components/ui/Loader';
import {
  useLiveSyncStatus,
  useRetryRemoteSync,
} from '@/enbox/hooks/use-live-sync-status';
import { remoteDetail, summarizeSync, type SummaryTone } from './sync-summary';

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

function linkScopeLabel(link: ReplicationLinkSnapshot): string {
  if (link.scope.kind === 'full') {
    return 'Everything';
  }
  if (link.scope.kind === 'context') {
    return 'Shared context';
  }
  const count = link.scope.modules.length;
  return `${count} ${count === 1 ? 'module' : 'modules'}`;
}

function linkScopeDetail(link: ReplicationLinkSnapshot): string | undefined {
  if (link.scope.kind === 'full') {
    return undefined;
  }
  return link.scope.kind === 'context'
    ? `${link.scope.module}\n${link.scope.contextId}`
    : link.scope.modules.join('\n');
}

function linkKey(link: ReplicationLinkSnapshot): string {
  const scope = link.scope.kind === 'full'
    ? 'all'
    : link.scope.kind === 'context'
      ? `${link.scope.module}:${link.scope.contextId}`
      : link.scope.modules.join('|');
  return `${link.remoteEndpoint}:${link.delegateDid ?? 'owner'}:${scope}`;
}

function caughtUpLabel(links: readonly ReplicationLinkSnapshot[]): string {
  if (links.length === 0) {
    return 'Getting ready';
  }
  const currentCount = links.filter((link) => areReplicationLinksCurrent([link])).length;
  if (currentCount === links.length) {
    return 'Up to date';
  }
  return `Catching up (${currentCount} of ${links.length} done)`;
}

const SUMMARY_ICONS: Record<SummaryTone, React.ReactNode> = {
  ok       : <CheckCircle2 className="size-5 text-success" aria-hidden="true" />,
  progress : <RefreshCw className="size-5 text-accent" aria-hidden="true" />,
  warning  : <AlertTriangle className="size-5 text-warning" aria-hidden="true" />,
  error    : <AlertTriangle className="size-5 text-error" aria-hidden="true" />,
  offline  : <CloudOff className="size-5 text-text-tertiary" aria-hidden="true" />,
};

export function RemoteSyncStatusPanel({ did }: RemoteSyncStatusPanelProps) {
  const status = useLiveSyncStatus(did);
  const retryRemote = useRetryRemoteSync(did);
  const remotes = status.data?.remotes;
  const links = status.data?.links;

  async function handleRetry(remoteEndpoint: string): Promise<void> {
    try {
      await retryRemote.mutateAsync(remoteEndpoint);
      toast.success('Retrying sync');
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : 'Couldn’t retry sync');
    }
  }

  const summary = remotes && remotes.length > 0 ? summarizeSync(remotes, links ?? []) : undefined;

  return (
    <section className="space-y-3" aria-label="Sync status">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-text-tertiary" />
        <h3 className="text-sm font-semibold text-text-primary">Sync</h3>
      </div>

      {status.isLoading && <Loader message="Checking sync…" />}
      {status.error && (
        <ErrorAlert message={status.error instanceof Error ? status.error.message : 'Couldn’t check sync status'} />
      )}
      {!status.isLoading && !status.error && remotes?.length === 0 && (
        <div className="surface-card rounded-xl border border-border-default bg-surface-1 px-4 py-3 text-sm text-text-tertiary">
          Not syncing to any server yet.
        </div>
      )}

      {!status.error && remotes && summary && (
        <Disclosure
          // Remount when attention changes so problems open on their own,
          // while a calm panel stays however the user left it.
          key={summary.needsAttention ? 'attention' : 'calm'}
          open={summary.needsAttention}
          data-testid="sync-summary"
          className="surface-card rounded-xl border border-border-default bg-surface-1"
          summaryClassName="rounded-xl px-4 py-3.5 text-text-secondary hover:bg-surface-2/60"
          summary={(
            <>
              {SUMMARY_ICONS[summary.tone]}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-text-primary">{summary.headline}</span>
                <span className="block truncate text-xs font-normal text-text-tertiary">{summary.detail}</span>
              </span>
              <span className="shrink-0 text-xs font-normal text-text-ghost">Details</span>
            </>
          )}
          contentClassName="divide-y divide-border-subtle border-t border-border-subtle px-4"
        >
          {remotes.map((remote) => {
            const nextProbe = formatTimestamp(remote.nextProbeAt);
            const lastActivity = formatTimestamp(remote.lastActivityAt);
            const retrying = retryRemote.isPending && retryRemote.variables === remote.remoteEndpoint;
            const remoteLinks = links?.filter(
              ({ remoteEndpoint }) => remoteEndpoint === remote.remoteEndpoint,
            ) ?? [];

            return (
              <div key={remote.remoteEndpoint} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusIcon state={remote.state} />
                  <code className="min-w-0 flex-1 truncate text-xs text-text-primary" title={remote.remoteEndpoint}>
                    {remote.remoteEndpoint}
                  </code>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_CLASSES[remote.state]}`}>
                    {STATE_LABELS[remote.state]}
                  </span>
                </div>

                <div className="mt-1.5 space-y-1.5 pl-6">
                  <p className="text-xs text-text-secondary">{remoteDetail(remote)}</p>
                  {remote.lastError && (
                    <p className="break-words text-xs text-error">{remote.lastError}</p>
                  )}
                  <div
                    className="flex flex-wrap items-center gap-1.5"
                    aria-label={`What syncs to ${remote.remoteEndpoint}`}
                  >
                    <span className="text-[11px] text-text-tertiary" aria-live="polite">
                      {caughtUpLabel(remoteLinks)}
                    </span>
                    {remoteLinks.map((link) => (
                      <span
                        key={linkKey(link)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-2 px-2 py-0.5 text-[11px]"
                        title={linkScopeDetail(link)}
                      >
                        <span className="text-text-tertiary">{linkScopeLabel(link)}</span>
                        <span className={`font-medium ${LINK_STATUS_CLASSES[link.status]}`}>
                          {LINK_STATUS_LABELS[link.status]}
                        </span>
                      </span>
                    ))}
                  </div>
                  {(nextProbe || lastActivity) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-ghost">
                      {nextProbe && <span>Next automatic retry: {nextProbe}</span>}
                      {lastActivity && <span>Last synced: {lastActivity}</span>}
                    </div>
                  )}
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
            );
          })}
        </Disclosure>
      )}
    </section>
  );
}
