import type {
  DwnPermissionScope,
  DwnProtocolDefinition,
} from '@enbox/agent';
import type {
  ConnectPermissionRequest,
  ConnectRequest,
} from '@enbox/connect';
import type {
  EncryptionKeyDeriver,
  MessageSigner,
  PublicKeyJwk,
} from '@enbox/dwn-sdk-js';

import { X25519 } from '@enbox/crypto';
import { Did } from '@enbox/dids';
import {
  KeyDerivationScheme,
  PermissionsProtocol,
  Protocols,
  ProtocolsConfigure,
} from '@enbox/dwn-sdk-js';

import { resolveConnectSessionDurationSeconds } from './connect-session-duration';
import { assertConnectRequestType } from './connect-request-type';
import {
  getRequestedProtocolDefinitionsConflictMessage,
  protocolDefinitionsMatch,
  protocolHasEncryptedTypes,
} from './protocol-install';

export type ConnectPermissionPreflight = {
  permissions: ConnectPermissionRequest[];
  definitions: DwnProtocolDefinition[];
  scopes: DwnPermissionScope[];
};

const VALIDATION_SIGNER: MessageSigner = {
  keyId    : 'did:example:enbox-connect-validator#0',
  algorithm: 'EdDSA',
  sign     : async (): Promise<Uint8Array> => new Uint8Array(64),
};

let validationPublicKeyPromise: Promise<PublicKeyJwk> | undefined;

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertPermissionScope(
  value: unknown,
  protocol: string,
): asserts value is DwnPermissionScope {
  if (!isPlainRecord(value)) throw new Error('Each permission scope must be an object.');

  const interfaceName = value.interface;
  const method = value.method;
  if (value.protocol !== protocol) {
    throw new Error('All permission scopes must match the protocol URI they are provided with.');
  }

  if (interfaceName === 'Records') {
    if (method !== 'Read' && method !== 'Write' && method !== 'Delete') {
      throw new Error(`Records.${String(method)} is not supported by Connect.`);
    }
    return;
  }

  if (interfaceName === 'Messages') {
    if (method !== 'Read') throw new Error(`Messages.${String(method)} is not supported by Connect.`);
    return;
  }

  if (interfaceName === 'Protocols') {
    if (method !== 'Query') {
      if (method === 'Configure') {
        throw new Error('Protocols.Configure cannot be delegated through Connect. The wallet configures protocols during approval.');
      }
      throw new Error(`Protocols.${String(method)} is not supported by Connect.`);
    }
    return;
  }

  throw new Error(`The '${String(interfaceName)}' permission interface is not supported by Connect.`);
}

function assertProtocolDefinition(value: unknown): asserts value is DwnProtocolDefinition {
  if (!isPlainRecord(value)) throw new Error('Each protocol definition must be an object.');
  requireString(value.protocol, 'Protocol URI');
  if (typeof value.published !== 'boolean') throw new Error('Protocol definitions must declare whether they are published.');
  if (!isPlainRecord(value.types) || !isPlainRecord(value.structure)) {
    throw new Error('Protocol definitions must include object types and structure fields.');
  }
}

function scopeFingerprint(scope: DwnPermissionScope): string {
  const scoped = scope as DwnPermissionScope & { contextId?: string; protocolPath?: string };
  return JSON.stringify([
    scope.interface,
    scope.method,
    'protocol' in scope ? scope.protocol : undefined,
    scoped.contextId,
    scoped.protocolPath,
  ]);
}

async function getValidationPublicKey(): Promise<PublicKeyJwk> {
  if (validationPublicKeyPromise === undefined) {
    validationPublicKeyPromise = X25519.generateKey().then(async (privateKey) =>
      X25519.computePublicKey({ key: privateKey }) as Promise<PublicKeyJwk>
    );
  }
  return validationPublicKeyPromise;
}

/** Run the installed DWN implementation's complete protocol and grant validators. */
export async function validateConnectPermissionSemantics(
  preflight: ConnectPermissionPreflight,
): Promise<void> {
  const publicKey = await getValidationPublicKey();
  const keyDeriver: EncryptionKeyDeriver = {
    rootKeyId       : 'urn:enbox:connect-validation-key',
    derivationScheme: KeyDerivationScheme.ProtocolPath,
    derivePublicKey : async (): Promise<PublicKeyJwk> => publicKey,
  };

  for (const definition of preflight.definitions) {
    try {
      const definitionWithKeys = protocolHasEncryptedTypes(definition)
        ? await Protocols.deriveAndInjectPublicEncryptionKeys(definition, keyDeriver)
        : definition;
      const configure = await ProtocolsConfigure.create({
        definition: definitionWithKeys,
        signer    : VALIDATION_SIGNER,
      });
      if (!protocolDefinitionsMatch(configure.message.descriptor.definition, definition)) {
        throw new Error('the protocol or schema URLs are not normalized');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown protocol validation error';
      throw new Error(`Protocol '${definition.protocol}' is invalid: ${detail}`);
    }
  }

  for (const scope of preflight.scopes) {
    try {
      const grant = await PermissionsProtocol.createGrant({
        signer      : VALIDATION_SIGNER,
        grantedTo   : 'did:example:enbox-connect-delegate',
        dateExpires : '2099-01-01T00:00:00.000000Z',
        delegated   : scope.interface === 'Records',
        scope,
      });
      PermissionsProtocol.validateSchema(grant.recordsWrite.message, grant.permissionGrantBytes);
      if (scopeFingerprint(grant.permissionGrantData.scope) !== scopeFingerprint(scope)) {
        throw new Error('the permission scope is not normalized');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown permission validation error';
      throw new Error(`Connect permission scope is invalid: ${detail}`);
    }
  }
}

export function preflightConnectPermissions(value: unknown): ConnectPermissionPreflight {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('The connection request must include at least one permission request.');
  }

  const permissions: ConnectPermissionRequest[] = [];
  const scopes: DwnPermissionScope[] = [];
  const byProtocol = new Map<string, DwnProtocolDefinition>();

  for (const permission of value) {
    if (!isPlainRecord(permission)) throw new Error('Each permission request must be an object.');
    assertProtocolDefinition(permission.protocolDefinition);
    if (!Array.isArray(permission.permissionScopes) || permission.permissionScopes.length === 0) {
      throw new Error('Each permission request must include at least one permission scope.');
    }

    const definition = permission.protocolDefinition;
    const validatedScopes: DwnPermissionScope[] = [];
    for (const scope of permission.permissionScopes) {
      assertPermissionScope(scope, definition.protocol);
      validatedScopes.push(scope);
    }

    const existing = byProtocol.get(definition.protocol);
    if (existing !== undefined && !protocolDefinitionsMatch(existing, definition)) {
      throw new Error(`The request includes different definitions for protocol '${definition.protocol}'.`);
    }
    byProtocol.set(definition.protocol, definition);
    scopes.push(...validatedScopes);
    permissions.push(permission as unknown as ConnectPermissionRequest);
  }

  const definitions = [...byProtocol.values()];
  const definitionConflict = getRequestedProtocolDefinitionsConflictMessage(definitions);
  if (definitionConflict !== undefined) throw new Error(definitionConflict);

  return {
    permissions,
    definitions,
    scopes,
  };
}

function parseCanonicalDid(value: string): Did | undefined {
  const parsed = Did.parse(value);
  if (
    parsed === null
    || parsed.uri !== value
    || parsed.path !== undefined
    || parsed.query !== undefined
    || parsed.fragment !== undefined
  ) {
    return undefined;
  }
  return parsed;
}

export function preflightConnectRequest(request: ConnectRequest): ConnectPermissionPreflight {
  const result = preflightConnectPermissions(request.permissionRequests);
  resolveConnectSessionDurationSeconds(request.requestedSessionTtlSeconds);
  const requestType = assertConnectRequestType(request);

  requireString(request.appName, 'Connect app name');

  if (request.delegateDid !== undefined && parseCanonicalDid(request.delegateDid) === undefined) {
    throw new Error('The connection request has an invalid delegate DID.');
  }
  if (requestType === 'refresh' && request.delegateDid === undefined) {
    throw new Error('A connection refresh must include the existing delegate DID.');
  }
  if (
    !Array.isArray(request.supportedDidMethods)
    || request.supportedDidMethods.length === 0
    || request.supportedDidMethods.some((method) => !/^did:[a-z0-9]+$/.test(method))
  ) {
    throw new Error('The connection request has invalid supported DID methods.');
  }

  return result;
}

export function isDidSupportedByRequest(didUri: string, supportedDidMethods: string[]): boolean {
  const parsed = parseCanonicalDid(didUri);
  return parsed !== undefined && supportedDidMethods.includes(`did:${parsed.method}`);
}
