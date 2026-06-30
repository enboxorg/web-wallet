import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDelegateDid,
  createPermissionGrants,
  denyConnectRequest,
  encryptDWebConnectResponse,
  fetchConnectRequest,
  generatePin,
  submitConnectResponse,
} from '../connect-effects';

const mocks = vi.hoisted(() => ({
  createPermissionGrants: vi.fn(),
  deriveScopedDecryptionKeys: vi.fn(),
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
    createPermissionGrants: mocks.createPermissionGrants,
    deriveScopedDecryptionKeys: mocks.deriveScopedDecryptionKeys,
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
    const delegateBearerDid = { uri: 'did:jwk:delegate' };
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
      delegateBearerDid,
      scopes as any,
      agent,
      connectSession,
    );

    expect(mocks.createPermissionGrants).toHaveBeenCalledWith(
      'did:dht:alice',
      delegateBearerDid,
      agent,
      scopes,
      { connectSession },
    );
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
