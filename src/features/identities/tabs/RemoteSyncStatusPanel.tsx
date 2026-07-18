import type { RemoteSyncState, RemoteSyncStatus } from '@enbox/agent';

import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, Server } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Loader } from '@/components/ui/Loader';
import {
  useRemoteSyncStatus,
  useRetryRemoteSync,
} from '@/enbox/hooks/use-remote-sync-status';

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

export function RemoteSyncStatusPanel({ did }: RemoteSyncStatusPanelProps) {
  const { data: remotes, isLoading, isError, error } = useRemoteSyncStatus(did);
  const retryRemote = useRetryRemoteSync(did);

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
      {isError && (
        <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load remote sync status'} />
      )}
      {!isLoading && !isError && remotes?.length === 0 && (
        <div className="rounded-lg border border-border-default bg-surface-1 px-4 py-3 text-sm text-text-tertiary">
          No active remote sync links yet.
        </div>
      )}

      {remotes?.map((remote) => {
        const nextProbe = formatTimestamp(remote.nextProbeAt);
        const lastActivity = formatTimestamp(remote.lastActivityAt);
        const retrying = retryRemote.isPending && retryRemote.variables === remote.remoteEndpoint;

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
