export type ConnectSessionTransport = 'relay' | 'postMessage';

export interface ConnectClientMetadata {
  origin?: string;
  userAgent?: string;
  platform?: string;
  language?: string;
  languages?: string[];
  timezone?: string;
}

export interface ConnectSessionMetadata {
  id: string;
  appName?: string;
  appIcon?: string;
  origin?: string;
  userAgent?: string;
  platform?: string;
  language?: string;
  languages?: string[];
  timezone?: string;
  transport?: ConnectSessionTransport;
  createdAt: string;
  expiresAt: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const CONNECT_SESSION_METADATA_LIMITS = {
  id        : 128,
  appName   : 128,
  appIcon   : 2048,
  origin    : 2048,
  userAgent : 512,
  platform  : 128,
  language  : 64,
  languages : 16,
  timezone  : 128,
};

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function boundedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const values = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, CONNECT_SESSION_METADATA_LIMITS.languages)
    .map((item) => item.trim().slice(0, CONNECT_SESSION_METADATA_LIMITS.language));

  return values.length > 0 ? values : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function randomSessionId(): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  if (randomId) return randomId;
  return `connect-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function sanitizeConnectClientMetadata(
  value: unknown,
  trustedOrigin: string,
): ConnectClientMetadata {
  const raw = isPlainObject(value) ? value : {};
  const languages = boundedStringArray(raw.languages);

  return {
    origin    : trustedOrigin,
    userAgent : boundedString(raw.userAgent, CONNECT_SESSION_METADATA_LIMITS.userAgent),
    platform  : boundedString(raw.platform, CONNECT_SESSION_METADATA_LIMITS.platform),
    language  : boundedString(raw.language, CONNECT_SESSION_METADATA_LIMITS.language),
    ...(languages ? { languages } : {}),
    timezone : boundedString(raw.timezone, CONNECT_SESSION_METADATA_LIMITS.timezone),
  };
}

export function createPostMessageConnectSessionMetadata(options: {
  appName?: string;
  appIcon?: string;
  clientMetadata: ConnectClientMetadata;
}): ConnectSessionMetadata {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  return {
    id        : randomSessionId().slice(0, CONNECT_SESSION_METADATA_LIMITS.id),
    createdAt : createdAt.toISOString(),
    expiresAt : expiresAt.toISOString(),
    transport : 'postMessage',
    ...(options.appName
      ? { appName: options.appName.slice(0, CONNECT_SESSION_METADATA_LIMITS.appName) }
      : {}),
    ...(options.appIcon
      ? { appIcon: options.appIcon.slice(0, CONNECT_SESSION_METADATA_LIMITS.appIcon) }
      : {}),
    ...options.clientMetadata,
  };
}
