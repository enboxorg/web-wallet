import {
  CONNECT_SESSION_DEFAULT_TTL_SECONDS,
  CONNECT_SESSION_MAX_TTL_SECONDS,
} from '@enbox/agent';

export function resolveConnectSessionDurationSeconds(requestedSeconds?: number): number {
  if (requestedSeconds === undefined) {
    return CONNECT_SESSION_DEFAULT_TTL_SECONDS;
  }

  const requestedWholeSeconds = Math.floor(requestedSeconds);
  if (!Number.isFinite(requestedSeconds) || requestedWholeSeconds < 1) {
    throw new Error('The connection request has an invalid session lifetime.');
  }

  return Math.min(requestedWholeSeconds, CONNECT_SESSION_MAX_TTL_SECONDS);
}

export function formatConnectSessionDuration(requestedSeconds?: number): string {
  let remaining = resolveConnectSessionDurationSeconds(requestedSeconds);
  if (remaining === CONNECT_SESSION_DEFAULT_TTL_SECONDS) return '24 hours';

  const parts: string[] = [];
  const units = [
    { label: 'day', seconds: 24 * 60 * 60 },
    { label: 'hour', seconds: 60 * 60 },
    { label: 'minute', seconds: 60 },
    { label: 'second', seconds: 1 },
  ];

  for (const unit of units) {
    const count = Math.floor(remaining / unit.seconds);
    if (count === 0) continue;
    parts.push(`${count} ${unit.label}${count === 1 ? '' : 's'}`);
    remaining -= count * unit.seconds;
  }

  return parts.join(', ');
}
