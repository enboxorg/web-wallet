import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAndSendGrantKeyRecords,
  createDelegateDid,
  createPermissionGrants,
  createSessionRevocationGrants,
  denyConnectRequest,
  encryptDWebConnectResponse,
  fetchConnectRequest,
  generatePin,
  selectEncryptedReadGrants,
  submitConnectResponse,
} from '../connect-effects';

const mocks = vi.hoisted(() => ({
  createGrantKeyRecordsForGrants: vi.fn(),
  createPermissionGrants: vi.fn(),
  encryptPostMessagePayload: vi.fn(),
  generateEphemeralKeyPair: vi.fn(),
  decryptRequest: vi.fn(),
  verifyJwt: vi.fn(),
  assertConnectRequest: vi.fn(),
  randomPin: vi.fn(),
  submitConnectResponse: vi.fn(),
  convertPrivateKeyToX25519: vi.fn(),
  didJwkCreate: vi.fn(),
}));

vi.mock('@enbox/agent', () => ({
  EnboxConnectProtocol: {
    createGrantKeyRecordsForGrants: mocks.createGrantKeyRecordsForGrants,
    createPermissionGrants: mocks.createPermissionGrants,
    decryptRequest: mocks.decryptRequest,
    verifyJwt: mocks.verifyJwt,
    assertConnectRequest: mocks.assertConnectRequest,
    submitConnectResponse: mocks.submitConnectResponse,
  },
}));

vi.mock('@enbox/browser', () => ({
  encryptPostMessagePayload: mocks.encryptPostMessagePayload,
  generateEphemeralKeyPair: mocks.generateEphemeralKeyPair,
}));

vi.mock('@enbox/crypto', () => ({
  CryptoUtils: {
    randomPin: mocks.randomPin,
  },
  Ed25519: {
    convertPrivateKeyToX25519: mocks.convertPrivateKeyToX25519,
  },
}));

vi.mock('@enbox/dids', () => ({
  Did: {
    parse: (uri: string) => ({ uri, method: uri.split(':')[1] }),
  },
  DidJwk: {
    create: mocks.didJwkCreate,
  },
}));

describe('connect Effect adapters', () => {
  const jwtHeader = btoa(JSON.stringify({ kid: 'did:jwk:client#0' }))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => new Response('encrypted-request')),
    });
    mocks.decryptRequest.mockResolvedValue(`${jwtHeader}.payload.signature`);
  });

  it('wraps connect request fetching and PIN generation', async () => {
    const request = {
      clientDid   : 'did:jwk:client',
      callbackUrl : 'https://relay.example/callback',
      state       : 'state-1',
    };
    mocks.verifyJwt.mockResolvedValue(request);
    mocks.randomPin.mockReturnValue('1234');

    await expect(fetchConnectRequest('https://relay.example/request', 'key')).resolves.toBe(request);
    await expect(generatePin(4)).resolves.toBe('1234');

    expect(fetch).toHaveBeenCalledWith(
      new URL('https://relay.example/request'),
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(mocks.decryptRequest).toHaveBeenCalledWith({
      jwe: 'encrypted-request',
      encryptionKey: 'key',
    });
    expect(mocks.verifyJwt).toHaveBeenCalledWith({ jwt: `${jwtHeader}.payload.signature` });
    expect(mocks.randomPin).toHaveBeenCalledWith({ length: 4 });
  });

  it('retries transient connect request fetch failures', async () => {
    const request = {
      clientDid   : 'did:jwk:client',
      callbackUrl : 'https://relay.example/callback',
      state       : 'state-1',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new Error('temporary fetch failure'))
      .mockResolvedValueOnce(new Response('encrypted-request'));
    mocks.verifyJwt.mockResolvedValue(request);

    await expect(fetchConnectRequest('https://relay.example/request', 'key')).resolves.toBe(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects signer substitution and unsafe callback URLs', async () => {
    mocks.verifyJwt.mockResolvedValue({
      clientDid   : 'did:jwk:other',
      callbackUrl : 'https://relay.example/callback',
    });
    await expect(fetchConnectRequest('https://relay.example/request', 'key'))
      .rejects.toThrow('client DID does not match');

    mocks.verifyJwt.mockResolvedValue({
      clientDid   : 'did:jwk:client',
      callbackUrl : 'http://remote.example/callback',
    });
    await expect(fetchConnectRequest('https://relay.example/request', 'key'))
      .rejects.toThrow('Connect callback URL must use HTTPS');

    mocks.verifyJwt.mockResolvedValue({
      clientDid   : 'did:jwk:client',
      callbackUrl : 'https://other.example/callback',
    });
    await expect(fetchConnectRequest('https://relay.example/request', 'key'))
      .resolves.toEqual(expect.objectContaining({ callbackUrl: 'https://other.example/callback' }));
  });

  it('rejects unsafe request URLs and invalid relay responses before JWT use', async () => {
    await expect(fetchConnectRequest('http://remote.example/request', 'key'))
      .rejects.toThrow('Connect request URI must use HTTPS');

    vi.mocked(fetch).mockResolvedValue(new Response('missing', { status: 404 }));
    await expect(fetchConnectRequest('https://relay.example/missing', 'key'))
      .rejects.toThrow('Connect request fetch failed (404)');

    vi.mocked(fetch).mockResolvedValue(new Response('', {
      headers: { 'content-length': '2000001' },
    }));
    await expect(fetchConnectRequest('https://relay.example/large', 'key'))
      .rejects.toThrow('response is too large');

    vi.mocked(fetch).mockResolvedValue(new Response('encrypted-request'));
    mocks.decryptRequest.mockResolvedValue('e30.payload.signature');
    await expect(fetchConnectRequest('https://relay.example/malformed', 'key'))
      .rejects.toThrow('missing its signing DID');
  });

  it('submits connect responses with the provided agent service', async () => {
    const agent = { id: 'agent-1' };
    const request = { state: 'state-1' } as any;

    await submitConnectResponse('did:dht:alice', request, '1234', agent);

    expect(mocks.submitConnectResponse).toHaveBeenCalledWith(
      'did:dht:alice',
      request,
      '1234',
      agent,
    );
  });

  it('passes connect session metadata through permission grant creation', async () => {
    const agent = { id: 'agent-1' };
    const delegateDid = 'did:jwk:delegate';
    const scopes = [{
      interface: 'Records',
      method: 'Read',
      protocol: 'https://example.com/protocols/demo',
    }];
    const connectSession = {
      id        : 'session-1',
      createdAt : '2026-06-23T00:00:00.000Z',
      expiresAt : '2026-06-24T00:00:00.000Z',
      origin    : 'https://app.example',
      transport : 'postMessage' as const,
    };
    mocks.createPermissionGrants.mockResolvedValue([{ id: 'grant-1' }]);

    await createPermissionGrants(
      'did:dht:alice',
      delegateDid,
      scopes as any,
      agent,
      connectSession,
    );

    expect(mocks.createPermissionGrants).toHaveBeenCalledWith(
      'did:dht:alice',
      delegateDid,
      agent,
      scopes,
      { connectSession },
    );
  });

  it('delivers private grant keys only for Records.Read scopes', () => {
    const grants = ['read', 'write', 'messages'];
    const scopes = [
      { interface: 'Records', method: 'Read', protocol: 'https://example.com/protocols/demo' },
      { interface: 'Records', method: 'Write', protocol: 'https://example.com/protocols/demo' },
      { interface: 'Messages', method: 'Read', protocol: 'https://example.com/protocols/demo' },
    ];

    expect(selectEncryptedReadGrants(grants, scopes as any)).toEqual(['read']);
    expect(() => selectEncryptedReadGrants(['read'], scopes as any)).toThrow('grant count');
  });

  it('creates and returns narrowly scoped session revocation grants', async () => {
    let revocationIndex = 0;
    const agent = {
      dwn: {
        getRemoteDwnEndpointUrls: vi.fn(async () => ['https://dwn.example']),
      },
      permissions: {
        createGrant: vi.fn(async () => {
          revocationIndex += 1;
          return {
            message: {
              encodedData : 'AQ',
              recordId    : `revocation-${revocationIndex}`,
            },
          };
        }),
      },
      rpc: {
        sendDwnRequest: vi.fn(async () => ({ status: { code: 202, detail: 'Accepted' } })),
      },
    };
    const grants = [{ recordId: 'grant-1' }, { recordId: 'grant-2' }];

    const result = await createSessionRevocationGrants(
      'did:dht:alice',
      'did:jwk:delegate',
      grants as any,
      '2026-06-24T00:00:00.000000Z',
      agent as any,
    );

    expect(agent.permissions.createGrant).toHaveBeenNthCalledWith(1, expect.objectContaining({
      grantedTo : 'did:jwk:delegate',
      dateExpires: '2026-06-24T00:00:00.000000Z',
      scope      : {
        interface : 'Records',
        method    : 'Write',
        protocol  : 'https://identity.foundation/dwn/permissions',
        contextId : 'grant-1',
      },
    }));
    expect(result.grants).toHaveLength(4);
    expect(result.sessionRevocations).toEqual([
      { grantId: 'grant-1', revocationGrantId: 'revocation-1' },
      { grantId: 'grant-2', revocationGrantId: 'revocation-2' },
    ]);
    expect(agent.rpc.sendDwnRequest).toHaveBeenCalledTimes(2);
  });

  it('creates and fans out durable grantKey records for created grants', async () => {
    const agent = {
      dwn: {
        getDwnEndpointUrlsForTarget: vi.fn(async () => ['http://127.0.0.1:3000']),
        getRemoteDwnEndpointUrls: vi.fn(async () => ['https://dwn-a.example', 'https://dwn-b.example']),
      },
      rpc: {
        sendDwnRequest: vi.fn(async () => ({ status: { code: 202, detail: 'Accepted' } })),
      },
    };
    const delegateDid = 'did:jwk:delegate';
    const delegateX25519PrivateKey = { kty: 'OKP', crv: 'X25519', d: 'secret', x: 'public' };
    const grantMessages = [{ recordId: 'grant-1' }];
    const protocolDefinitions = [{ protocol: 'https://example.com/protocols/demo' }];
    const grantKeyRecord = {
      encodedData : 'AQ',
      recordId    : 'grant-key-1',
      descriptor  : { protocol: 'https://enbox.org/protocols/encryption' },
    };
    mocks.createGrantKeyRecordsForGrants.mockResolvedValue([grantKeyRecord]);

    await createAndSendGrantKeyRecords(
      'did:dht:alice',
      delegateDid,
      delegateX25519PrivateKey as any,
      grantMessages as any,
      protocolDefinitions as any,
      agent as any,
    );

    expect(mocks.createGrantKeyRecordsForGrants).toHaveBeenCalledWith({
      agent,
      ownerDid              : 'did:dht:alice',
      granteeDid            : 'did:jwk:delegate',
      granteeRootPrivateKey : delegateX25519PrivateKey,
      grantMessages,
      protocolDefinitions,
    });
    expect(agent.rpc.sendDwnRequest).toHaveBeenCalledTimes(2);
    expect(agent.dwn.getDwnEndpointUrlsForTarget).not.toHaveBeenCalled();
    expect(agent.rpc.sendDwnRequest).toHaveBeenCalledWith(expect.objectContaining({
      dwnUrl    : 'https://dwn-a.example',
      targetDid : 'did:dht:alice',
      message   : {
        recordId   : 'grant-key-1',
        descriptor : { protocol: 'https://enbox.org/protocols/encryption' },
      },
    }));
  });

  it('posts denial callbacks as form data', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    await denyConnectRequest('https://relay.example/callback', 'state-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://relay.example/callback',
      expect.objectContaining({
        method: 'POST',
        body: 'id_token=DENIED&state=state-1',
      }),
    );
  });

  it('creates delegate DIDs with the required X25519 private key', async () => {
    const portableDid = { privateKeys: ['ed25519-private'] };
    const bearerDid = { export: vi.fn(async () => portableDid) };
    mocks.didJwkCreate.mockResolvedValue(bearerDid);
    mocks.convertPrivateKeyToX25519.mockResolvedValue('x25519-private');

    const result = await createDelegateDid();

    expect(result.delegateBearerDid).toBe(bearerDid);
    expect(result.delegatePortableDid.privateKeys).toEqual([
      'ed25519-private',
      'x25519-private',
    ]);
    expect(result.delegateX25519PrivateKey).toBe('x25519-private');
  });

  it('encrypts DWeb Connect response payloads', async () => {
    mocks.generateEphemeralKeyPair.mockResolvedValue({
      keyPair: { privateKey: 'wallet-private' },
      publicKeyBase64url: 'wallet-public',
    });
    mocks.encryptPostMessagePayload.mockResolvedValue('encrypted');

    await expect(
      encryptDWebConnectResponse({ ok: true }, 'dapp-public'),
    ).resolves.toBe('encrypted');

    expect(mocks.encryptPostMessagePayload).toHaveBeenCalledWith(
      { ok: true },
      { privateKey: 'wallet-private' },
      'wallet-public',
      'dapp-public',
    );
  });
});
