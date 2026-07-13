import { describe, expect, it, vi } from 'vitest';
import type { ConnectPermissionRequest, EnboxConnectRequest } from '@enbox/agent';

const mocks = vi.hoisted(() => ({
  getEncryptionKeyInfo: vi.fn(),
}));

vi.mock('@enbox/agent', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/agent')>(),
  getEncryptionKeyInfo: mocks.getEncryptionKeyInfo,
}));

import {
  isDidSupportedByRequest,
  preflightConnectPermissions,
  preflightDelegateEncryption,
  preflightConnectRequest,
  validateConnectPermissionSemantics,
} from '../connect-request-preflight';

const protocol = 'https://example.com/protocols/tasks';
const definition = {
  protocol,
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
    protocolDefinition: definition,
    permissionScopes: [scope],
  }] as ConnectPermissionRequest[];
}

function relayRequest(overrides: Partial<EnboxConnectRequest> = {}): EnboxConnectRequest {
  return {
    clientDid      : 'did:jwk:client',
    appName        : 'Tasks',
    callbackUrl    : 'https://relay.example/connect/callback',
    nonce          : 'nonce',
    state          : 'state',
    responseMode   : 'direct_post',
    supportedDidMethods: ['did:dht', 'did:jwk'],
    permissionRequests: permissions({ interface: 'Records', method: 'Read', protocol }),
    ...overrides,
  };
}

describe('connect request preflight', () => {
  it.each([
    ['Records', 'Read'],
    ['Records', 'Write'],
    ['Records', 'Delete'],
    ['Messages', 'Read'],
    ['Protocols', 'Query'],
  ])('accepts the Connect scope %s.%s', (interfaceName, method) => {
    const result = preflightConnectPermissions(permissions({
      interface: interfaceName,
      method,
      protocol,
    }));

    expect(result.scopes).toHaveLength(1);
    expect(result.definitions).toEqual([definition]);
  });

  it.each([
    ['Records', 'Query'],
    ['Records', 'Subscribe'],
    ['Records', 'Count'],
    ['Messages', 'Query'],
    ['Protocols', 'Configure'],
    ['Permissions', 'Grant'],
  ])('rejects unsupported scope %s.%s', (interfaceName, method) => {
    expect(() => preflightConnectPermissions(permissions({
      interface: interfaceName,
      method,
      protocol,
    }))).toThrow(/not supported|cannot be delegated/i);
  });

  it('rejects malformed, mismatched, and empty scopes', () => {
    expect(() => preflightConnectPermissions([])).toThrow('at least one permission');
    expect(() => preflightConnectPermissions([{ ...permissions({})[0], permissionScopes: [] }]))
      .toThrow('at least one permission scope');
    expect(() => preflightConnectPermissions(permissions(null as unknown as Record<string, unknown>)))
      .toThrow('must be an object');
    expect(() => preflightConnectPermissions(permissions({
      interface : 'Records',
      method    : 'Read',
      protocol  : 'https://evil.example/protocol',
    }))).toThrow('must match the protocol URI');
  });

  it('rejects conflicting duplicate definitions and requester-owned key metadata', () => {
    const conflicting = {
      ...definition,
      types: { task: { schema: 'https://evil.example/task' } },
    };
    expect(() => preflightConnectPermissions([
      ...permissions({ interface: 'Records', method: 'Read', protocol }),
      {
        protocolDefinition: conflicting,
        permissionScopes: [{ interface: 'Records', method: 'Write', protocol }],
      },
    ])).toThrow('different definitions');

    expect(() => preflightConnectPermissions([{
      protocolDefinition: {
        ...definition,
        $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'requester-key' } },
      },
      permissionScopes: [{ interface: 'Records', method: 'Read', protocol }],
    }])).toThrow('wallet-managed encryption keys');
  });

  it('requires normalized protocol URIs', () => {
    expect(() => preflightConnectPermissions([{
      protocolDefinition: { ...definition, protocol: 'HTTPS://example.com/protocols/tasks' },
      permissionScopes: [{ interface: 'Records', method: 'Read', protocol: 'HTTPS://example.com/protocols/tasks' }],
    }])).toThrow('not normalized');
  });

  it('runs the complete DWN protocol and permission validators before mutation', async () => {
    const valid = preflightConnectPermissions(
      permissions({ interface: 'Records', method: 'Read', protocol }),
    );
    await expect(validateConnectPermissionSemantics(valid)).resolves.toBeUndefined();

    const malformed = preflightConnectPermissions([{
      protocolDefinition: {
        ...definition,
        structure: { task: { $actions: [{ who: 'anyone', can: ['not-an-action'] }] } },
      },
      permissionScopes: [{ interface: 'Records', method: 'Read', protocol }],
    }] as unknown as ConnectPermissionRequest[]);
    await expect(validateConnectPermissionSemantics(malformed)).rejects.toThrow('is invalid');
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

  it('requires refresh requests to carry the existing delegate DID', () => {
    const refreshWithoutDelegate = {
      ...relayRequest(),
      requestType: 'refresh',
    };
    const refreshWithDelegate = {
      ...refreshWithoutDelegate,
      delegateDid: 'did:jwk:delegate',
    };

    expect(() => preflightConnectRequest(refreshWithoutDelegate as never))
      .toThrow('must include the existing delegate DID');
    expect(() => preflightConnectRequest(refreshWithDelegate as never))
      .not.toThrow();
  });

  it('rejects an unsupported request type at the wallet boundary', () => {
    expect(() => preflightConnectRequest({
      ...relayRequest(),
      requestType: 'renew',
    } as never)).toThrow("must be 'connect' or 'refresh'");
  });

  it('matches selected identities to the request DID-method set', () => {
    expect(isDidSupportedByRequest('did:dht:abc', ['did:dht'])).toBe(true);
    expect(isDidSupportedByRequest('did:jwk:abc', ['did:dht'])).toBe(false);
    expect(isDidSupportedByRequest('did:dht:abc#key', ['did:dht'])).toBe(false);
  });

  it('requires a delegate encryption key before approving encrypted read access', async () => {
    const encryptedPermissions = [{
      protocolDefinition: {
        ...definition,
        types: { task: { ...definition.types.task, encryptionRequired: true } },
      },
      permissionScopes: [{ interface: 'Records', method: 'Read', protocol }],
    }] as ConnectPermissionRequest[];
    const request = relayRequest({
      delegateDid: 'did:jwk:delegate',
      permissionRequests: encryptedPermissions,
    });
    const preflight = preflightConnectRequest(request);
    const agent = { id: 'agent' } as any;

    await preflightDelegateEncryption(agent, request, preflight);

    expect(mocks.getEncryptionKeyInfo).toHaveBeenCalledWith(agent, 'did:jwk:delegate');
  });
});
