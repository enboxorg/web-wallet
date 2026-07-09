import type { ConnectPermissionRequest } from '@enbox/agent';
import { Did } from '@enbox/dids';
import type { DWebConnectRequest } from '@/stores/dweb-connect-store';
import {
  sanitizeConnectClientMetadata,
  type ConnectClientMetadata,
} from './connect-session-metadata';
import {
  isPlainRecord,
  preflightConnectPermissions,
} from './connect-request-preflight';

const MAX_APP_NAME_LENGTH = 120;
const MAX_URL_LENGTH = 2048;
const MAX_EPHEMERAL_KEY_LENGTH = 4096;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export interface SanitizedDWebConnectRequest {
  origin: string;
  data: Record<string, unknown>;
  permissions: ConnectPermissionRequest[];
  appName?: string;
  appIcon?: string;
  clientMetadata: ConnectClientMetadata;
  portableIdentity?: unknown;
  portableIdentityDid?: string;
  ephemeralPublicKey: string;
  requestedDid?: string;
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
  if (!did) return undefined;
  const parsed = Did.parse(did);
  if (!parsed || parsed.uri !== did || parsed.path || parsed.query || parsed.fragment) return undefined;
  return did;
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;

  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function sanitizeEphemeralPublicKey(value: unknown): string | undefined {
  const publicKey = optionalString(value, MAX_EPHEMERAL_KEY_LENGTH);
  if (!publicKey) return undefined;

  const bytes = decodeBase64Url(publicKey);
  if (bytes?.length !== 65 || bytes[0] !== 0x04) return undefined;
  return publicKey;
}

function sanitizePortableIdentityDid(value: unknown): string | undefined {
  if (!isPlainRecord(value) || !isPlainRecord(value.portableDid) || !isPlainRecord(value.metadata)) {
    return undefined;
  }

  const portableDid = sanitizeRequestedDid(value.portableDid.uri);
  const metadataDid = sanitizeRequestedDid(value.metadata.uri);
  return portableDid === metadataDid ? portableDid : undefined;
}

export async function isValidDWebConnectEphemeralPublicKey(publicKey: string): Promise<boolean> {
  const bytes = decodeBase64Url(publicKey);
  if (bytes === undefined) return false;

  try {
    const rawKey = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      [],
    );
    return true;
  } catch {
    return false;
  }
}

function sanitizePermissions(value: unknown): ConnectPermissionRequest[] | undefined {
  try {
    return preflightConnectPermissions(value).permissions;
  } catch {
    return undefined;
  }
}

export function sanitizeDWebConnectRequest(
  request: DWebConnectRequest,
): SanitizedDWebConnectRequest | undefined {
  const origin = normalizeTrustedOrigin(request.origin);
  if (!origin || !isPlainRecord(request.data)) return undefined;
  if (request.data.type !== 'dweb-connect-authorization-request') return undefined;

  const permissions = sanitizePermissions(
    request.data.permissions ?? request.data.permissionRequests,
  );
  if (!permissions) return undefined;

  const ephemeralPublicKey = sanitizeEphemeralPublicKey(request.data.ephemeralPublicKey);
  if (!ephemeralPublicKey) return undefined;

  const portableIdentity = request.data.portableIdentity;
  const portableIdentityDid = portableIdentity === undefined
    ? undefined
    : sanitizePortableIdentityDid(portableIdentity);
  if (portableIdentity !== undefined && !portableIdentityDid) return undefined;

  const requestedDid = sanitizeRequestedDid(request.data.did);
  if (portableIdentityDid && requestedDid && portableIdentityDid !== requestedDid) return undefined;

  return {
    origin,
    data: request.data,
    permissions,
    appName: optionalString(request.data.appName, MAX_APP_NAME_LENGTH),
    appIcon: sanitizeIconUrl(request.data.appIcon, origin),
    clientMetadata: sanitizeConnectClientMetadata(request.data.clientMetadata, origin),
    portableIdentity,
    portableIdentityDid,
    ephemeralPublicKey,
    requestedDid,
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
