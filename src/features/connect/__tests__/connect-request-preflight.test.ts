import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest, ConnectRequest } from '@enbox/connect';

import {
  isDidSupportedByRequest,
  preflightConnectPermissions,
  preflightConnectRequest,
  validateConnectPermissionSemantics,
} from '../connect-request-preflight';

const module = 'https://example.com/modules/tasks';
const definition = {
  module,
  published: false,
  types: {
    task: { schema: 'https://example.com/schemas/task' },
  },
  structure: {
    task: {},
  },
};

function permissions(scope: Record<string, unknown>): ConnectPermissionRequest[] {
  return [{
    moduleDefinition: definition,
    permissionScopes: [scope],
  }] as ConnectPermissionRequest[];
}

function relayRequest(overrides: Partial<ConnectRequest> = {}): ConnectRequest {
  return {
    clientDid      : 'did:jwk:client',
    appName        : 'Tasks',
    callbackUrl    : 'https://relay.example/connect/callback',
    nonce          : 'nonce',
    state          : 'state',
    responseMode   : 'direct_post',
    supportedDidMethods: ['did:dht', 'did:jwk'],
    permissionRequests: permissions({ interface: 'Records', method: 'Read', module }),
    ...overrides,
  };
}

describe('connect request preflight', () => {
  it.each([
    ['Records', 'Read'],
    ['Records', 'Write'],
    ['Records', 'Delete'],
    ['Messages', 'Read'],
    ['Modules', 'Query'],
  ])('accepts the Connect scope %s.%s', (interfaceName, method) => {
    const result = preflightConnectPermissions(permissions({
      interface: interfaceName,
      method,
      module,
    }));

    expect(result.scopes).toHaveLength(1);
    expect(result.definitions).toEqual([definition]);
  });

  it.each([
    ['Records', 'Query'],
    ['Records', 'Subscribe'],
    ['Records', 'Count'],
    ['Messages', 'Query'],
    ['Modules', 'Configure'],
    ['Permissions', 'Grant'],
  ])('rejects unsupported scope %s.%s', (interfaceName, method) => {
    expect(() => preflightConnectPermissions(permissions({
      interface: interfaceName,
      method,
      module,
    }))).toThrow(/not supported|cannot be delegated/i);
  });

  it('rejects malformed, mismatched, and absent scope arrays', () => {
    expect(() => preflightConnectPermissions([])).toThrow('at least one permission');
    expect(() => preflightConnectPermissions([{ ...permissions({})[0], permissionScopes: undefined }]))
      .toThrow('permission scope array');
    expect(() => preflightConnectPermissions(permissions(null as unknown as Record<string, unknown>)))
      .toThrow('must be an object');
    expect(() => preflightConnectPermissions(permissions({
      interface : 'Records',
      method    : 'Read',
      module  : 'https://evil.example/module',
    }))).toThrow('must match the module URI');
  });

  it('rejects conflicting duplicate definitions and requester-owned key metadata', () => {
    const conflicting = {
      ...definition,
      types: { task: { schema: 'https://evil.example/task' } },
    };
    expect(() => preflightConnectPermissions([
      ...permissions({ interface: 'Records', method: 'Read', module }),
      {
        moduleDefinition: conflicting,
        permissionScopes: [{ interface: 'Records', method: 'Write', module }],
      },
    ])).toThrow('different definitions');

    const requesterKeyPermission = {
      moduleDefinition: {
        ...definition,
        $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'requester-key' } },
      },
      permissionScopes: [{ interface: 'Records', method: 'Read', module }],
    } as ConnectPermissionRequest;
    expect(() => preflightConnectPermissions([requesterKeyPermission]))
      .toThrow('wallet-managed encryption keys');

    // Authored comparison intentionally ignores generated key metadata. Every
    // duplicate must still be inspected so a later clean copy cannot hide it.
    expect(() => preflightConnectPermissions([
      requesterKeyPermission,
      ...permissions({ interface: 'Records', method: 'Write', module }),
    ])).toThrow('wallet-managed encryption keys');
  });

  it('requires normalized module URIs', () => {
    expect(() => preflightConnectPermissions([{
      moduleDefinition: { ...definition, module: 'HTTPS://example.com/modules/tasks' },
      permissionScopes: [{ interface: 'Records', method: 'Read', module: 'HTTPS://example.com/modules/tasks' }],
    }])).toThrow('not normalized');
  });

  it('runs the complete DWN module and permission validators before mutation', async () => {
    const valid = preflightConnectPermissions(
      permissions({ interface: 'Records', method: 'Read', module }),
    );
    await expect(validateConnectPermissionSemantics(valid)).resolves.toBeUndefined();

    const malformed = preflightConnectPermissions([{
      moduleDefinition: {
        ...definition,
        structure: { task: { $actions: [{ who: 'anyone', can: ['not-an-action'] }] } },
      },
      permissionScopes: [{ interface: 'Records', method: 'Read', module }],
    }] as unknown as ConnectPermissionRequest[]);
    await expect(validateConnectPermissionSemantics(malformed)).rejects.toThrow('is invalid');
  });

  it('validates a composed consumer with a plaintext role provider without adding provider grants', async () => {
    const provider = {
      module: 'https://example.com/modules/workspace', published: false,
      types: { workspace: {}, member: {} },
      structure: { workspace: { member: { $role: true } } },
    } as const;
    const consumer = {
      module: 'https://example.com/modules/comments', published: false,
      uses: { core: provider.module },
      types: { comment: { encryptionRequired: true } },
      structure: { workspace: { $ref: 'core:workspace', comment: {
        $actions: [{ role: 'core:workspace/member', can: ['read'] }],
      } } },
    } as const;
    const requested: ConnectPermissionRequest[] = [
      { moduleDefinition: provider, permissionScopes: [] },
      { moduleDefinition: consumer, permissionScopes: [{ interface: 'Records', method: 'Read', module: consumer.module }] },
    ];
    const snapshot = structuredClone(requested);
    const checked = preflightConnectPermissions(requested);
    await expect(validateConnectPermissionSemantics(checked)).resolves.toBeUndefined();
    expect(checked.scopes).toEqual(snapshot[1].permissionScopes);
    expect(checked.permissions).toEqual(snapshot);
    expect(requested).toEqual(snapshot);
    expect(requested[0].moduleDefinition).not.toHaveProperty('$keyAgreement');

    const invalid = preflightConnectPermissions([
      requested[0],
      { ...requested[1], moduleDefinition: { ...consumer, structure: { workspace: { ...consumer.structure.workspace, $ref: 'core:missing' } } } },
    ]);
    await expect(validateConnectPermissionSemantics(invalid)).rejects.toThrow(/missing|not found/);
  });

  it('defers dependencies omitted from the request to owner-specific SDK approval', async () => {
    const checked = preflightConnectPermissions([{
      moduleDefinition: {
        module, published: false,
        uses: { owner: 'https://example.com/modules/installed-owner' },
        types: { task: {} },
        structure: { workspace: { $ref: 'owner:workspace', task: {} } },
      },
      permissionScopes: [{ interface: 'Records', method: 'Read', module }],
    }]);
    await expect(validateConnectPermissionSemantics(checked)).resolves.toBeUndefined();
  });

  it('applies relay TTL, delegate DID, and supported-method checks', () => {
    expect(() => preflightConnectRequest(relayRequest({ requestedSessionTtlSeconds: 0.5 })))
      .toThrow('invalid session lifetime');
    expect(() => preflightConnectRequest(relayRequest({ delegateDid: ' did:jwk:delegate' })))
      .toThrow('invalid delegate DID');
    expect(() => preflightConnectRequest(relayRequest({ supportedDidMethods: [] })))
      .toThrow('invalid supported DID methods');
    expect(preflightConnectRequest(relayRequest({ requestedSessionTtlSeconds: 90 * 24 * 60 * 60 + 1 })).scopes)
      .toHaveLength(1);
  });

  it('matches selected identities to the request DID-method set', () => {
    expect(isDidSupportedByRequest('did:dht:abc', ['did:dht'])).toBe(true);
    expect(isDidSupportedByRequest('did:jwk:abc', ['did:dht'])).toBe(false);
    expect(isDidSupportedByRequest('did:dht:abc#key', ['did:dht'])).toBe(false);
  });

});
