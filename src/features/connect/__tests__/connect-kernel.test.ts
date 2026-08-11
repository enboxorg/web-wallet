import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  approveConnectRequest,
  approvePopupConnectRequest,
  denyConnectRequest,
  fetchConnectRequest,
  generatePin,
  getRelayCallbackUrl,
  isTrustedDappOrigin,
  waitForRelayCompletion,
} from '../connect-kernel';

const mocks = vi.hoisted(() => ({
  executeConnectApproval: vi.fn(),
  openRequest: vi.fn(),
  sealApprovedResponse: vi.fn(),
  pollRelayComplete: vi.fn(),
  postRelayResponse: vi.fn(),
  randomPin: vi.fn(),
}));

vi.mock('@enbox/agent', () => ({
  executeConnectApproval: mocks.executeConnectApproval,
}));

vi.mock('@enbox/connect', () => ({
  CONNECT_DENIED_TOKEN: 'DENIED',
  ConnectProvider: {
    openRequest: mocks.openRequest,
    sealApprovedResponse: mocks.sealApprovedResponse,
  },
  pollRelayComplete: mocks.pollRelayComplete,
  postRelayResponse: mocks.postRelayResponse,
}));

vi.mock('@enbox/crypto', () => ({
  CryptoUtils: {
    randomPin: mocks.randomPin,
  },
}));

const REQUEST_KEY = new Uint8Array(32);

function connectRequest(overrides: Record<string, unknown> = {}) {
  return {
    clientDid : 'did:jwk:client',
    appName   : 'Example App',
    clientMetadata: { origin: 'https://claimed.example' },
    reply     : { mode: 'direct_post', callbackUrl: 'https://relay.example/connect/callback' },
    state     : 'state-1',
    nonce     : 'nonce-1',
    responseKey: { kty: 'OKP', crv: 'X25519', x: 'response-key' },
    supportedDidMethods: ['did:dht'],
    permissionRequests: [],
    ...overrides,
  } as any;
}

describe('connect-kernel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => new Response('sealed-request-jwe')),
    });
    mocks.openRequest.mockResolvedValue(connectRequest());
    mocks.executeConnectApproval.mockResolvedValue({
      delegateDid: 'did:jwk:delegate',
      delegateGrants: [],
      sessionRevocations: [],
      responseSigner: { uri: 'did:jwk:delegate' },
    });
    mocks.sealApprovedResponse.mockResolvedValue('sealed-response-jwe');
    mocks.pollRelayComplete.mockResolvedValue(false);
    mocks.postRelayResponse.mockResolvedValue(undefined);
    mocks.randomPin.mockReturnValue('1234');
  });

  describe('fetchConnectRequest', () => {
    it('fetches, opens, and validates a relayed request', async () => {
      await expect(fetchConnectRequest('https://relay.example/request', REQUEST_KEY))
        .resolves.toEqual(expect.objectContaining({ clientDid: 'did:jwk:client' }));

      expect(fetch).toHaveBeenCalledWith(
        new URL('https://relay.example/request'),
        expect.objectContaining({ redirect: 'error' }),
      );
      expect(mocks.openRequest).toHaveBeenCalledWith({
        jwe: 'sealed-request-jwe',
        decryption: { mode: 'dir', requestKey: REQUEST_KEY },
      });
    });

    it('rejects unsafe request URLs before fetching', async () => {
      await expect(fetchConnectRequest('http://remote.example/request', REQUEST_KEY))
        .rejects.toThrow('Connect request URI must use HTTPS');
      await expect(fetchConnectRequest('https://user:pw@relay.example/request', REQUEST_KEY))
        .rejects.toThrow('Connect request URI must use HTTPS');
      await expect(fetchConnectRequest('https://relay.example/request#fragment', REQUEST_KEY))
        .rejects.toThrow('Connect request URI must use HTTPS');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('maps a consumed or expired single-use pointer to actionable copy', async () => {
      // 404/410 on the relay pointer is definitive (single-use, TTL-bound):
      // the message must be user-actionable and must NOT contain the
      // retryable-error keywords (fetch/network/timeout/status codes) the
      // network policy matches on, or the wallet would retry a dead pointer.
      vi.mocked(fetch).mockResolvedValue(new Response('missing', { status: 404 }));
      await expect(fetchConnectRequest('https://relay.example/missing', REQUEST_KEY))
        .rejects.toThrow('This connection code was already used or has expired');

      vi.mocked(fetch).mockResolvedValue(new Response('gone', { status: 410 }));
      await expect(fetchConnectRequest('https://relay.example/gone', REQUEST_KEY))
        .rejects.toThrow('This connection code was already used or has expired');
    });

    it('rejects failed and oversized relay responses', async () => {
      vi.mocked(fetch).mockResolvedValue(new Response('oops', { status: 500 }));
      await expect(fetchConnectRequest('https://relay.example/broken', REQUEST_KEY))
        .rejects.toThrow('Connect request fetch failed (500)');

      vi.mocked(fetch).mockResolvedValue(new Response('', {
        headers: { 'content-length': '2000001' },
      }));
      await expect(fetchConnectRequest('https://relay.example/large', REQUEST_KEY))
        .rejects.toThrow('response is too large');
    });

    it('caps streamed relay responses that declare no content length', async () => {
      const chunk = new Uint8Array(1_000_000);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.enqueue(chunk);
          controller.close();
        },
      });
      vi.mocked(fetch).mockResolvedValue(new Response(stream));

      await expect(fetchConnectRequest('https://relay.example/streamed', REQUEST_KEY))
        .rejects.toThrow('response is too large');
    });

    it('rejects opened requests that do not use the relay reply mode', async () => {
      mocks.openRequest.mockResolvedValue(connectRequest({ reply: { mode: 'post_message' } }));
      await expect(fetchConnectRequest('https://relay.example/request', REQUEST_KEY))
        .rejects.toThrow('does not use the relay reply mode');
    });

    it('rejects unsafe callback URLs in opened requests', async () => {
      mocks.openRequest.mockResolvedValue(connectRequest({
        reply: { mode: 'direct_post', callbackUrl: 'http://remote.example/callback' },
      }));
      await expect(fetchConnectRequest('https://relay.example/request', REQUEST_KEY))
        .rejects.toThrow('Connect callback URL must use HTTPS');
    });
  });

  describe('getRelayCallbackUrl', () => {
    it('returns the validated callback for direct_post replies', () => {
      expect(getRelayCallbackUrl(connectRequest())).toBe('https://relay.example/connect/callback');
    });

    it('throws for post_message replies', () => {
      expect(() => getRelayCallbackUrl(connectRequest({ reply: { mode: 'post_message' } })))
        .toThrow('does not use the relay reply mode');
    });
  });

  describe('approveConnectRequest', () => {
    it('runs the ceremony, seals with the PIN, and posts to the callback', async () => {
      const agent = { id: 'agent-1' } as any;
      const request = connectRequest({ requestedSessionTtlSeconds: 86_400 });

      await approveConnectRequest('did:dht:alice', request, '1234', 3_600, agent);

      expect(mocks.executeConnectApproval).toHaveBeenCalledWith({
        agent,
        approvedSessionTtlSeconds : 3_600,
        providerDid               : 'did:dht:alice',
        request                   : expect.objectContaining({ requestedSessionTtlSeconds: 3_600 }),
        transport                 : 'relay',
      });
      expect(mocks.sealApprovedResponse).toHaveBeenCalledWith({
        request,
        providerDid : 'did:dht:alice',
        approval    : expect.objectContaining({ delegateDid: 'did:jwk:delegate' }),
        signer      : { uri: 'did:jwk:delegate' },
        pin         : '1234',
      });
      expect(mocks.postRelayResponse).toHaveBeenCalledWith({
        callbackUrl : 'https://relay.example/connect/callback',
        state       : 'state-1',
        idToken     : 'sealed-response-jwe',
      });
      // Seal happens before delivery, after the ceremony.
      expect(mocks.executeConnectApproval.mock.calls[0][0].request).not.toBe(request);
      expect(request.requestedSessionTtlSeconds).toBe(86_400);
      expect(mocks.sealApprovedResponse.mock.calls[0][0].request).toBe(request);
      expect(mocks.executeConnectApproval.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.sealApprovedResponse.mock.invocationCallOrder[0]);
      expect(mocks.sealApprovedResponse.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.postRelayResponse.mock.invocationCallOrder[0]);
    });

    it('never retries the non-idempotent ceremony, even on network-shaped failures', async () => {
      mocks.executeConnectApproval.mockRejectedValue(
        new Error('failed to fetch: network timeout contacting DWN'),
      );

      await expect(
        approveConnectRequest(
          'did:dht:alice',
          connectRequest(),
          '1234',
          3_600,
          { id: 'agent-1' } as any,
        ),
      ).rejects.toThrow('network timeout');

      // A retrying policy around the ceremony would invoke it more than once.
      expect(mocks.executeConnectApproval).toHaveBeenCalledTimes(1);
      expect(mocks.postRelayResponse).not.toHaveBeenCalled();
    });

    it('validates the callback URL before running the ceremony', async () => {
      const request = connectRequest({
        reply: { mode: 'direct_post', callbackUrl: 'http://remote.example/callback' },
      });

      await expect(
        approveConnectRequest(
          'did:dht:alice',
          request,
          '1234',
          3_600,
          { id: 'agent-1' } as any,
        ),
      ).rejects.toThrow('Connect callback URL must use HTTPS');
      expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
    });
  });

  describe('waitForRelayCompletion', () => {
    it('polls the callback completion marker with the request state', async () => {
      mocks.pollRelayComplete.mockResolvedValue(true);
      const request = connectRequest();

      await expect(waitForRelayCompletion(request)).resolves.toBe(true);
      expect(mocks.pollRelayComplete).toHaveBeenCalledWith({
        callbackUrl : 'https://relay.example/connect/callback',
        state       : 'state-1',
      });
    });
  });

  describe('approvePopupConnectRequest', () => {
    it('stamps the transport origin into the ceremony request but seals the original', async () => {
      const agent = { id: 'agent-1' } as any;
      const request = connectRequest({ reply: { mode: 'post_message' } });

      await expect(
        approvePopupConnectRequest(
          'did:dht:alice',
          request,
          'https://app.example',
          604_800,
          agent,
        ),
      ).resolves.toBe('sealed-response-jwe');

      expect(mocks.executeConnectApproval).toHaveBeenCalledWith({
        agent,
        approvedSessionTtlSeconds : 604_800,
        providerDid               : 'did:dht:alice',
        request                   : expect.objectContaining({
          applicationId              : 'https://app.example',
          clientMetadata             : { origin: 'https://app.example' },
          requestedSessionTtlSeconds : 604_800,
        }),
        transport                 : 'postMessage',
      });
      const sealArgs = mocks.sealApprovedResponse.mock.calls[0][0];
      expect(sealArgs.request).toBe(request);
      expect(sealArgs.pin).toBeUndefined();
      expect(request).not.toHaveProperty('applicationId');
      expect(request).not.toHaveProperty('requestedSessionTtlSeconds');
    });

    it('never retries the popup ceremony', async () => {
      mocks.executeConnectApproval.mockRejectedValue(new Error('fetch failed: ECONNRESET'));

      await expect(
        approvePopupConnectRequest(
          'did:dht:alice',
          connectRequest({ reply: { mode: 'post_message' } }),
          'https://app.example',
          3_600,
          { id: 'agent-1' } as any,
        ),
      ).rejects.toThrow('ECONNRESET');
      expect(mocks.executeConnectApproval).toHaveBeenCalledTimes(1);
    });
  });

  describe('denyConnectRequest', () => {
    it('posts the deny token to a validated callback', async () => {
      await denyConnectRequest('https://relay.example/connect/callback', 'state-1');

      expect(mocks.postRelayResponse).toHaveBeenCalledWith({
        callbackUrl : 'https://relay.example/connect/callback',
        state       : 'state-1',
        idToken     : 'DENIED',
      });
    });

    it('refuses unsafe callback URLs without posting', async () => {
      await expect(denyConnectRequest('http://remote.example/callback', 'state-1'))
        .rejects.toThrow('Connect callback URL must use HTTPS');
      expect(mocks.postRelayResponse).not.toHaveBeenCalled();
    });
  });

  describe('isTrustedDappOrigin', () => {
    it('accepts HTTPS and local development origins', () => {
      expect(isTrustedDappOrigin('https://app.example')).toBe(true);
      expect(isTrustedDappOrigin('http://localhost:5173')).toBe(true);
      expect(isTrustedDappOrigin('http://127.0.0.1:8080')).toBe(true);
    });

    it('rejects everything else', () => {
      expect(isTrustedDappOrigin('http://remote.example')).toBe(false);
      expect(isTrustedDappOrigin('null')).toBe(false);
      expect(isTrustedDappOrigin('')).toBe(false);
      expect(isTrustedDappOrigin('https://app.example/path')).toBe(false);
      expect(isTrustedDappOrigin('not-a-url')).toBe(false);
    });
  });

  it('generates a numeric PIN of the requested length', async () => {
    await expect(generatePin(4)).resolves.toBe('1234');
    expect(mocks.randomPin).toHaveBeenCalledWith({ length: 4 });
  });
});
