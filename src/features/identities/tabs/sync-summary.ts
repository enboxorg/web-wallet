import {
  areReplicationLinksCurrent,
  type RemoteSyncStatus,
  type ReplicationLinkSnapshot,
} from '@enbox/agent';

import { formatRelativeTime } from '@/lib/utils';

export function remoteDetail(status: RemoteSyncStatus): string {
  if (status.state === 'quota-blocked') {
    const count = status.quotaBlockedMessageCount;
    return `${count} ${count === 1 ? 'change is' : 'changes are'} waiting because this server's storage is full.`;
  }
  if (status.failedMessageCount > 0) {
    const count = status.failedMessageCount;
    return `${count} ${count === 1 ? 'change' : 'changes'} couldn't sync to this server.`;
  }
  if (status.state === 'offline') {
    return 'Can’t reach this server right now. The wallet keeps retrying automatically.';
  }
  return 'Syncing normally.';
}

export type SummaryTone = 'ok' | 'progress' | 'warning' | 'error' | 'offline';

export interface SyncSummary {
  tone: SummaryTone;
  headline: string;
  detail: string;
  /** Problems are never tucked away: the server details open on their own. */
  needsAttention: boolean;
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint;
  }
}

function latestActivity(remotes: readonly RemoteSyncStatus[]): string | undefined {
  const latest = remotes
    .map((remote) => remote.lastActivityAt)
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1);
  return latest ? formatRelativeTime(Date.parse(latest)) : undefined;
}

/** One line for all servers: the worst state wins. */
export function summarizeSync(
  remotes: readonly RemoteSyncStatus[],
  links: readonly ReplicationLinkSnapshot[],
): SyncSummary {
  const total = remotes.length;
  const servers = `${total} ${total === 1 ? 'server' : 'servers'}`;
  const problems = remotes.filter((remote) => remote.state !== 'healthy');

  if (problems.length > 0) {
    if (problems.length === total && problems.every((remote) => remote.state === 'offline')) {
      return {
        tone           : 'offline',
        headline       : total === 1 ? 'Can’t reach your sync server' : 'Can’t reach your sync servers',
        detail         : 'Changes stay on this device and sync once a server is reachable.',
        needsAttention : true,
      };
    }
    const tone: SummaryTone = problems.some((remote) => remote.state === 'degraded')
      ? 'error'
      : problems.some((remote) => remote.state === 'quota-blocked') ? 'warning' : 'offline';
    return {
      tone,
      headline: total === 1
        ? 'Your sync server needs attention'
        : `${problems.length} of ${total} servers ${problems.length === 1 ? 'needs' : 'need'} attention`,
      detail         : total === 1 ? remoteDetail(problems[0]) : `${hostOf(problems[0].remoteEndpoint)}: ${remoteDetail(problems[0])}`,
      needsAttention : true,
    };
  }

  const behind = remotes.filter((remote) => {
    const remoteLinks = links.filter(({ remoteEndpoint }) => remoteEndpoint === remote.remoteEndpoint);
    return remoteLinks.length === 0 || !areReplicationLinksCurrent(remoteLinks);
  });
  if (behind.length > 0) {
    return {
      tone           : 'progress',
      headline       : 'Syncing',
      detail         : `Catching up with ${behind.length} of ${servers}`,
      needsAttention : false,
    };
  }

  const last = latestActivity(remotes);
  return {
    tone           : 'ok',
    headline       : 'All synced',
    detail         : last ? `${servers} · last synced ${last}` : servers,
    needsAttention : false,
  };
}
