import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAndSendGrantKeyRecords,
  createDelegateDid,
  createPermissionGrants,
  denyConnectRequest,
  encryptDWebConnectResponse,
  fetchConnectRequest,
  generatePin,
  submitConnectResponse,
} from '../connect-effects';

const mocks = vi.hoisted(() => ({
  createGrantKeyRecordsForGrants: vi.fn(),
  createPermissionGrants: vi.fn(),
  encryptPostMessagePayload: vi.fn(),
  generateEphemeralKeyPair: vi.fn(),
  getConnectRequest: vi.fn(),
  randomPin: vi.fn(),
  submitConnectResponse: vi.fn(),
  convertPrivateKeyToX25519: vi.fn(),
  didJwkCreate: vi.fn(),
}));

vi.mock('@enbox/agent', () => ({
  EnboxConnectProtocol: {
    createGrantKeyRecordsForGrants: mocks.createGrantKeyRecordsForGrants,
    createPermissionGrants: mocks.createPermissionGrants,
    getConnectRequest: mocks.getConnectRequest,
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
  DidJwk: {
    create: mocks.didJwkCreate,
  },
}));

describe('connect Effect adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps connect request fetching and PIN generation', async () => {
    const request = { state: 'state-1' };
    mocks.getConnectRequest.mockResolvedValue(request);
    mocks.randomPin.mockReturnValue('1234');

    await expect(fetchConnectRequest('https://relay.example/request', 'key')).resolves.toBe(request);
    await expect(generatePin(4)).resolves.toBe('1234');

    expect(mocks.getConnectRequest).toHaveBeenCalledWith('https://relay.example/request', 'key');
    expect(mocks.randomPin).toHaveBeenCalledWith({ length: 4 });
  });

  it('retries transient connect request fetch failures', async () => {
    const request = { state: 'state-1' };
    mocks.getConnectRequest
      .mockRejectedValueOnce(new Error('temporary fetch failure'))
      .mockResolvedValueOnce(request);

    await expect(fetchConnectRequest('https://relay.example/request', 'key')).resolves.toBe(request);
    expect(mocks.getConnectRequest).toHaveBeenCalledTimes(2);
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

  it('creates and fans out durable grantKey records for created grants', async () => {
    const agent = {
      dwn: {
        getDwnEndpointUrlsForTarget: vi.fn(async () => ['https://dwn-a.example', 'https://dwn-b.example']),
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
