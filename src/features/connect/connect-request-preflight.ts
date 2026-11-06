import type {
  DwnPermissionScope,
  DwnModuleDefinition,
} from '@enbox/agent';
import type {
  ConnectPermissionRequest,
  ConnectRequest,
} from '@enbox/connect';
import { assertConnectAuthenticationParams, assertConnectAuthenticationRequest } from '@enbox/connect';
import type {
  MessageSigner,
} from '@enbox/dwn-sdk-js';

import { Did } from '@enbox/dids';
import {
  PermissionsModule,
  ModulesConfigure,
  resolveModuleGraph,
} from '@enbox/dwn-sdk-js';

import { resolveConnectSessionDurationSeconds } from './connect-session-duration';
import {
  getRequestedModuleDefinitionsConflictMessage,
} from './module-install';

export type ConnectPermissionPreflight = {
  permissions: ConnectPermissionRequest[];
  definitions: DwnModuleDefinition[];
  scopes: DwnPermissionScope[];
};

const VALIDATION_SIGNER: MessageSigner = {
  keyId    : 'did:example:enbox-connect-validator#0',
  algorithm: 'EdDSA',
  sign     : async (): Promise<Uint8Array> => new Uint8Array(64),
};

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
  module: string,
): asserts value is DwnPermissionScope {
  if (!isPlainRecord(value)) throw new Error('Each permission scope must be an object.');

  const interfaceName = value.interface;
  const method = value.method;
  if (value.module !== module) {
    throw new Error('All permission scopes must match the module URI they are provided with.');
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

  if (interfaceName === 'Modules') {
    if (method !== 'Query') {
      if (method === 'Configure') {
        throw new Error('Modules.Configure cannot be delegated through Connect. The wallet configures modules during approval.');
      }
      throw new Error(`Modules.${String(method)} is not supported by Connect.`);
    }
    return;
  }

  throw new Error(`The '${String(interfaceName)}' permission interface is not supported by Connect.`);
}

function assertModuleDefinition(value: unknown): asserts value is DwnModuleDefinition {
  if (!isPlainRecord(value)) throw new Error('Each module definition must be an object.');
  requireString(value.module, 'Module URI');
  if (typeof value.published !== 'boolean') throw new Error('Module definitions must declare whether they are published.');
  if (!isPlainRecord(value.types) || !isPlainRecord(value.structure)) {
    throw new Error('Module definitions must include object types and structure fields.');
  }
}

function scopeFingerprint(scope: DwnPermissionScope): string {
  const scoped = scope as DwnPermissionScope & { contextId?: string; modulePath?: string };
  return JSON.stringify([
    scope.interface,
    scope.method,
    'module' in scope ? scope.module : undefined,
    scoped.contextId,
    scoped.modulePath,
  ]);
}

/** Dependencies omitted by the requester are resolved against the selected owner during approval. */
function hasRequestedDependencyClosure(
  definition: DwnModuleDefinition,
  definitions: ReadonlyMap<string, DwnModuleDefinition>,
): boolean {
  const pending = [definition];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current.module)) continue;
    visited.add(current.module);
    for (const uri of Object.values(current.uses ?? {})) {
      const dependency = definitions.get(uri);
      if (dependency === undefined) return false;
      pending.push(dependency);
    }
  }
  return true;
}

/** Run the installed DWN implementation's complete module and grant validators. */
export async function validateConnectPermissionSemantics(
  preflight: ConnectPermissionPreflight,
): Promise<void> {
  const definitions = new Map(preflight.definitions.map(definition => [definition.module, definition]));

  for (const definition of preflight.definitions) {
    try {
      ModulesConfigure.validateModuleDefinition(definition, { requireKeyAgreement: false });
      if (hasRequestedDependencyClosure(definition, definitions)) {
        resolveModuleGraph(definition, uri => definitions.get(uri), { requireKeyAgreement: false });
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown module validation error';
      throw new Error(`Module '${definition.module}' is invalid: ${detail}`);
    }
  }

  for (const scope of preflight.scopes) {
    try {
      const grant = await PermissionsModule.createGrant({
        signer      : VALIDATION_SIGNER,
        grantedTo   : 'did:example:enbox-connect-delegate',
        dateExpires : '2099-01-01T00:00:00.000000Z',
        delegated   : scope.interface === 'Records',
        scope,
      });
      PermissionsModule.validateSchema(grant.recordsWrite.message, grant.permissionGrantBytes);
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
  const requestedDefinitions: DwnModuleDefinition[] = [];
  const byModule = new Map<string, DwnModuleDefinition>();

  for (const permission of value) {
    if (!isPlainRecord(permission)) throw new Error('Each permission request must be an object.');
    assertModuleDefinition(permission.moduleDefinition);
    if (!Array.isArray(permission.permissionScopes)) {
      throw new Error('Each permission request must include a permission scope array.');
    }

    const definition = permission.moduleDefinition;
    const validatedScopes: DwnPermissionScope[] = [];
    for (const scope of permission.permissionScopes) {
      assertPermissionScope(scope, definition.module);
      validatedScopes.push(scope);
    }

    requestedDefinitions.push(definition);
    if (!byModule.has(definition.module)) {
      byModule.set(definition.module, definition);
    }
    scopes.push(...validatedScopes);
    permissions.push(permission as unknown as ConnectPermissionRequest);
  }

  const definitionConflict = getRequestedModuleDefinitionsConflictMessage(requestedDefinitions);
  if (definitionConflict !== undefined) throw new Error(definitionConflict);

  return {
    permissions,
    definitions: [...byModule.values()],
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
  if (request.authentication !== undefined) {
    assertConnectAuthenticationParams(request.authentication);
  }
  let result: ConnectPermissionPreflight;
  if (request.requestType === 'authenticate') {
    assertConnectAuthenticationRequest(request);
    result = { permissions: [], definitions: [], scopes: [] };
  } else {
    result = preflightConnectPermissions(request.permissionRequests);
    resolveConnectSessionDurationSeconds(request.requestedSessionTtlSeconds);
  }

  requireString(request.appName, 'Connect app name');

  if (request.delegateDid !== undefined && parseCanonicalDid(request.delegateDid) === undefined) {
    throw new Error('The connection request has an invalid delegate DID.');
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
