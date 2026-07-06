import type { ConnectPermissionRequest } from '@enbox/agent';
import { Ed25519 } from '@enbox/crypto';
import { DidJwk } from '@enbox/dids';

import {
  sanitizeConnectClientMetadata,
  type ConnectClientMetadata,
} from './connect-session-metadata';

/**
 * Protocol-agnostic CLI connect request/response.
 *
 * A command-line tool (gitd, meshd, …) generates a request that carries the
 * DWN protocol definitions + permission scopes it wants, signs a proof with an
 * ephemeral client DID, base64url-encodes it, and opens the wallet at
 * `/cli/connect?request=<base64url>`. The wallet renders an approval UI from
 * whatever the request supplies — there is nothing tool-specific here.
 *
 * On approval the wallet returns a delegate DID + permission grants, delivered
 * to the tool over a loopback HTTP callback (or copy/paste of the JSON).
 */

const MAX_APP_NAME_LENGTH = 120;
const MAX_URL_LENGTH = 2048;
const MAX_DID_LENGTH = 2048;
const MAX_CHALLENGE_LENGTH = 512;
const MAX_PROOF_LENGTH = 8192;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DID_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

export const CLI_CONNECT_REQUEST_TYPE = 'cli-connect-request';
export const CLI_CONNECT_RESPONSE_TYPE = 'cli-connect-response';

export interface CliConnectRequest {
  version: 1;
  type: typeof CLI_CONNECT_REQUEST_TYPE;
  appName?: string;
  permissions: ConnectPermissionRequest[];
  /** Ephemeral DID (did:jwk) the requesting tool controls. */
  cliDid: string;
  /** Random nonce echoed back in the response to bind it to this request. */
  challenge: string;
  /** Ed25519 signature (base64url) by `cliDid` over the canonical proof message. */
  cliProof: string;
  /** Loopback URL the wallet POSTs the response to. */
  callbackUrl?: string;
  clientMetadata: ConnectClientMetadata;
}

export interface CliConnectResponse {
  version: 1;
  type: typeof CLI_CONNECT_RESPONSE_TYPE;
  connectedDid: string;
  /** Portable delegate DID, including private keys, for the tool to hold. */
  delegateDid: unknown;
  grants: unknown[];
  walletOrigin: string;
  expiresAt?: string;
  challenge: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
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

/** True when `value` is an `http://` loopback URL safe to deliver a response to. */
export function isLoopbackCallbackUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeRequestPayload(raw: string): unknown {
  // Accept either a bare base64url payload or one behind a `scheme://...` URI.
  const schemeIndex = raw.indexOf('://');
  const payload = schemeIndex === -1
    ? raw
    : raw.slice(schemeIndex + 3).replace(/^[^/]*\//, '');
  const json = new TextDecoder().decode(base64UrlToBytes(payload));
  return JSON.parse(json);
}

function proofMessage(cliDid: string, challenge: string): Uint8Array {
  return new TextEncoder().encode(`${CLI_CONNECT_REQUEST_TYPE}:${cliDid}:${challenge}`);
}

/** Verify the request was signed by the holder of `cliDid` (anti-forgery + replay). */
export async function verifyCliProof(request: CliConnectRequest): Promise<boolean> {
  try {
    const { didDocument } = await DidJwk.resolve(request.cliDid);
    const jwk = (didDocument?.verificationMethod ?? [])
      .map((method: any) => method?.publicKeyJwk)
      .find((key: any) => key?.kty === 'OKP' && key?.crv === 'Ed25519' && key?.x);
    if (!jwk) return false;

    return await Ed25519.verify({
      key       : jwk,
      data      : proofMessage(request.cliDid, request.challenge),
      signature : base64UrlToBytes(request.cliProof),
    });
  } catch {
    return false;
  }
}

/**
 * Decode, validate, and authenticate a CLI connect request from the
 * `?request=` query parameter.
 *
 * @throws With a human-readable message when the request is malformed,
 *   incomplete, targets a non-loopback callback, or fails proof verification.
 */
export async function parseCliConnectRequest(raw: string | null): Promise<CliConnectRequest> {
  if (!raw) {
    throw new Error('Missing CLI connect request.');
  }

  let decoded: unknown;
  try {
    decoded = decodeRequestPayload(raw);
  } catch {
    throw new Error('Could not decode the CLI connect request.');
  }

  if (!isPlainObject(decoded) || decoded.type !== CLI_CONNECT_REQUEST_TYPE) {
    throw new Error('Unrecognized CLI connect request.');
  }

  const permissions = sanitizePermissions(decoded.permissions);
  if (!permissions) {
    throw new Error('The CLI connect request did not include any valid permissions.');
  }

  const cliDid = optionalString(decoded.cliDid, MAX_DID_LENGTH);
  if (!cliDid || !DID_PATTERN.test(cliDid)) {
    throw new Error('The CLI connect request is missing a valid client DID.');
  }

  const challenge = optionalString(decoded.challenge, MAX_CHALLENGE_LENGTH);
  const cliProof = optionalString(decoded.cliProof, MAX_PROOF_LENGTH);
  if (!challenge || !cliProof) {
    throw new Error('The CLI connect request is missing its signed proof.');
  }

  const callbackUrl = optionalString(decoded.callbackUrl, MAX_URL_LENGTH);
  if (callbackUrl && !isLoopbackCallbackUrl(callbackUrl)) {
    throw new Error('The CLI connect callback must be a loopback (127.0.0.1) URL.');
  }

  const request: CliConnectRequest = {
    version        : 1,
    type           : CLI_CONNECT_REQUEST_TYPE,
    appName        : optionalString(decoded.appName, MAX_APP_NAME_LENGTH),
    permissions,
    cliDid,
    challenge,
    cliProof,
    ...(callbackUrl ? { callbackUrl } : {}),
    clientMetadata : sanitizeConnectClientMetadata(decoded.clientMetadata, callbackUrl ?? 'cli'),
  };

  if (!(await verifyCliProof(request))) {
    throw new Error('The CLI connect request proof could not be verified.');
  }

  return request;
}
