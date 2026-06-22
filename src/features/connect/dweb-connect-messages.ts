import type { ConnectPermissionRequest } from '@enbox/agent';
import type { DWebConnectRequest } from '@/stores/dweb-connect-store';

const MAX_APP_NAME_LENGTH = 120;
const MAX_URL_LENGTH = 2048;
const MAX_EPHEMERAL_KEY_LENGTH = 4096;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DID_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

export interface SanitizedDWebConnectRequest {
  origin: string;
  data: Record<string, unknown>;
  permissions: ConnectPermissionRequest[];
  appName?: string;
  appIcon?: string;
  portableIdentity?: unknown;
  ephemeralPublicKey?: string;
  requestedDid?: string;
}

const READ_LIKE_REMOVED_RECORD_METHODS = new Set(['Query', 'Subscribe', 'Count']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLocalHttpOrigin(url: URL): boolean {
  return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
}

export function normalizeTrustedOrigin(origin: string): string | undefined {
  if (!origin || origin === 'null') return undefined;

  try {
    const url = new URL(origin);
    if (url.origin !== origin) return undefined;
    if (url.protocol === 'https:' || isLocalHttpOrigin(url)) {
      return url.origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function referrerOrigin(referrer: string | undefined): string | undefined {
  if (!referrer) return undefined;

  try {
    return normalizeTrustedOrigin(new URL(referrer).origin);
  } catch {
    return undefined;
  }
}

function optionalString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function sanitizeIconUrl(value: unknown, requestOrigin: string): string | undefined {
  const raw = optionalString(value, MAX_URL_LENGTH);
  if (!raw) return undefined;

  try {
    const url = new URL(raw, requestOrigin);
    if (url.protocol !== 'https:' && !isLocalHttpOrigin(url)) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function sanitizeRequestedDid(value: unknown): string | undefined {
  const did = optionalString(value, MAX_URL_LENGTH);
  if (!did || !DID_PATTERN.test(did)) return undefined;
  return did;
}

function sanitizePermissions(value: unknown): ConnectPermissionRequest[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const valid = value.every((permission) => {
    if (!isPlainObject(permission)) return false;
    const protocolDefinition = permission.protocolDefinition;
    const permissionScopes = permission.permissionScopes;
    return isPlainObject(protocolDefinition)
      && typeof protocolDefinition.protocol === 'string'
      && protocolDefinition.protocol.length > 0
      && Array.isArray(permissionScopes);
  });

  return valid ? value as ConnectPermissionRequest[] : undefined;
}

export function getUnsupportedConnectPermissionError(
  permissions: ConnectPermissionRequest[],
): string | undefined {
  for (const permission of permissions) {
    for (const scope of permission.permissionScopes as unknown[]) {
      if (!isPlainObject(scope)) continue;

      if (
        scope.interface === 'Records'
        && typeof scope.method === 'string'
        && READ_LIKE_REMOVED_RECORD_METHODS.has(scope.method)
      ) {
        return `Records.${scope.method} is no longer supported in DWeb Connect. The app must request Records.Read instead.`;
      }

      if (scope.interface === 'Protocols' && scope.method === 'Configure') {
        return 'Protocols.Configure cannot be delegated through DWeb Connect. The wallet configures protocols during approval.';
      }
    }
  }

  return undefined;
}

export function sanitizeDWebConnectRequest(
  request: DWebConnectRequest,
): SanitizedDWebConnectRequest | undefined {
  const origin = normalizeTrustedOrigin(request.origin);
  if (!origin || !isPlainObject(request.data)) return undefined;
  if (request.data.type !== 'dweb-connect-authorization-request') return undefined;

  const permissions = sanitizePermissions(
    request.data.permissions ?? request.data.permissionRequests,
  );
  if (!permissions) return undefined;

  const ephemeralPublicKey = optionalString(
    request.data.ephemeralPublicKey,
    MAX_EPHEMERAL_KEY_LENGTH,
  );

  return {
    origin,
    data: request.data,
    permissions,
    appName: optionalString(request.data.appName, MAX_APP_NAME_LENGTH),
    appIcon: sanitizeIconUrl(request.data.appIcon, origin),
    portableIdentity: request.data.portableIdentity,
    ephemeralPublicKey,
    requestedDid: sanitizeRequestedDid(request.data.did),
  };
}

export function isDWebConnectRequestEvent(
  event: MessageEvent,
  opener: Window | null,
  activeOrigin?: string,
): boolean {
  if (event.source !== opener) return false;

  const origin = normalizeTrustedOrigin(event.origin);
  if (!origin) return false;

  return !activeOrigin || activeOrigin === origin;
}
