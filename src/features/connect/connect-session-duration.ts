import {
  CONNECT_SESSION_MAX_TTL_SECONDS,
} from '@enbox/agent';

export const CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS = 60 * 60;

export const CONNECT_SESSION_DURATION_OPTIONS = [
  { value: 60 * 60, label: '1 hour' },
  { value: 7 * 24 * 60 * 60, label: '7 days' },
  { value: 30 * 24 * 60 * 60, label: '30 days' },
] as const;

export function resolveConnectSessionDurationSeconds(requestedSeconds?: number): number {
  if (requestedSeconds === undefined) {
    return CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS;
  }

  const requestedWholeSeconds = Math.floor(requestedSeconds);
  if (!Number.isFinite(requestedSeconds) || requestedWholeSeconds < 1) {
    throw new Error('The connection request has an invalid session lifetime.');
  }

  return Math.min(requestedWholeSeconds, CONNECT_SESSION_MAX_TTL_SECONDS);
}

export function resolveConnectSessionApprovalDurationSeconds(requestedSeconds?: number): number {
  return Math.min(
    CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
    resolveConnectSessionDurationSeconds(requestedSeconds),
  );
}

export function getConnectSessionDurationOptions(requestedSeconds?: number): Array<{
  value: number;
  label: string;
}> {
  const selected = resolveConnectSessionApprovalDurationSeconds(requestedSeconds);
  const maximum = requestedSeconds === undefined
    ? CONNECT_SESSION_MAX_TTL_SECONDS
    : resolveConnectSessionDurationSeconds(requestedSeconds);
  const options: Array<{ value: number; label: string }> = CONNECT_SESSION_DURATION_OPTIONS
    .filter(({ value }) => value <= maximum)
    .map((option) => ({ ...option }));

  if (!options.some(({ value }) => value === selected)) {
    options.push({ value: selected, label: formatConnectSessionDuration(selected) });
  }
  return options.sort((left, right) => left.value - right.value);
}

export function formatConnectSessionDuration(requestedSeconds?: number): string {
  let remaining = resolveConnectSessionDurationSeconds(requestedSeconds);

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

export function formatRelativeExpiry(dateExpires: string, now: Date = new Date()): string {
  const expiryTime = new Date(dateExpires).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(expiryTime) || !Number.isFinite(nowTime)) return 'at an unknown time';

  const differenceSeconds = (expiryTime - nowTime) / 1000;
  const absoluteSeconds = Math.abs(differenceSeconds);
  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { unit: 'day', seconds: 24 * 60 * 60 },
    { unit: 'hour', seconds: 60 * 60 },
    { unit: 'minute', seconds: 60 },
    { unit: 'second', seconds: 1 },
  ];
  const selected = units.find((unit) => absoluteSeconds >= unit.seconds) ?? units[3];
  const value = Math.round(differenceSeconds / selected.seconds);

  return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(value, selected.unit);
}
