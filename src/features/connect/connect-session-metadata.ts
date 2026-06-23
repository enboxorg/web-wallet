import type { ConnectClientMetadata } from '@enbox/agent';

const CONNECT_SESSION_METADATA_LIMITS = {
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

export type { ConnectClientMetadata };
