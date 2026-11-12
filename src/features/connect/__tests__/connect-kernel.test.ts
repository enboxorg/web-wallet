import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import {
  approveConnectRequest,
  approveConnectRequestEffect,
  approvePopupConnectRequest,
  denyConnectRequest,
  fetchConnectRequest,
  fetchConnectRequestEffect,
  generatePin,
  getRelayCallbackUrl,
  isTrustedDappOrigin,
  waitForRelayCompletion,
} from '../connect-kernel';
import { NetworkPolicy, makeNetworkPolicy } from '@/enbox/effect/network-policy';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { currentAgentLayer } from '@/enbox/effect/services';

const mocks = vi.hoisted(() => ({
  executeConnectApproval: vi.fn(),
  executeConnectAuthentication: vi.fn(),
  openRequest: vi.fn(),
  sealApprovedResponse: vi.fn(),
  sealAuthenticationResponse: vi.fn(),
  pollRelayComplete: vi.fn(),
  postRelayResponse: vi.fn(),
  randomPin: vi.fn(),
}));

vi.mock('@enbox/agent', () => ({
  executeConnectApproval: mocks.executeConnectApproval,
  executeConnectAuthentication: mocks.executeConnectAuthentication,
}));

vi.mock('@enbox/connect', () => ({
  CONNECT_DENIED_TOKEN: 'DENIED',
  ConnectProvider: {
    openRequest: mocks.openRequest,
    sealApprovedResponse: mocks.sealApprovedResponse,
    sealAuthenticationResponse: mocks.sealAuthenticationResponse,
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
    mocks.executeConnectAuthentication.mockResolvedValue({
      authenticationProof: 'owner-proof', responseSigner: { uri: 'did:jwk:ephemeral' },
    });
    mocks.sealAuthenticationResponse.mockResolvedValue('sealed-authentication-jwe');
    mocks.pollRelayComplete.mockResolvedValue(false);
    mocks.postRelayResponse.mockResolvedValue(undefined);
    mocks.randomPin.mockReturnValue('1234');
  });

  it.each(['relay', 'popup'] as const)('preserves installation-only provider requests through %s approval', async (transport) => {
    const provider = { module: 'https://example.test/modules/core', published: false, types: { workspace: {} }, structure: { workspace: {} } };
    const consumer = {
      module: 'https://example.test/modules/comments', published: false,
      uses: { core: provider.module }, types: { comment: {} },
      structure: { workspace: { $ref: 'core:workspace', comment: {} } },
    };
    const request = connectRequest({
      permissionRequests: [
        { moduleDefinition: provider, permissionScopes: [] },
        { moduleDefinition: consumer, permissionScopes: [{ interface: 'Records', method: 'Read', module: consumer.module }] },
      ],
      ...(transport === 'popup' ? { reply: { mode: 'post_message' } } : {}),
    });
    const original = structuredClone(request);
    if (transport === 'relay') {
      await approveConnectRequest('did:dht:owner', request, '1234', 3600, {} as any);
    } else {
      await approvePopupConnectRequest('did:dht:owner', request, 'https://app.example', 3600, {} as any);
    }
    const approved = mocks.executeConnectApproval.mock.calls[0][0];
    expect(approved.request).toEqual(original);
    expect(approved.request.permissionRequests[0].permissionScopes).toEqual([]);
    expect(approved.approvedModuleOverrides).toEqual([]);
    expect(request).toEqual(original);
  });

  describe('fetchConnectRequest', () => {
    it('requires an authentication request to be hosted by its audience origin', async () => {
      mocks.openRequest.mockResolvedValue(connectRequest({
        requestType: 'authenticate',
        authentication: { version: 1, audience: 'https://auth.example/', challenge: 'c'.repeat(32) },
      }));
      await expect(fetchConnectRequest('https://relay.example/request', REQUEST_KEY))
        .rejects.toThrow('sign-in service does not match');
      expect(mocks.executeConnectAuthentication).not.toHaveBeenCalled();
    });
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

    it('aborts the single-use relay claim when its deadline expires', async () => {
      let requestSignal: AbortSignal | undefined;
      vi.mocked(fetch).mockImplementation((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal as AbortSignal;
          requestSignal.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true },
          );
        }));

      const effect = fetchConnectRequestEffect(
        'https://relay.example/request',
        REQUEST_KEY,
      ).pipe(
        Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
          retryTimes: 0,
          timeout: '1 millis',
        }))),
      );

      await expect(runEnboxPromise(effect)).rejects.toThrow('timed out');
      expect(requestSignal?.aborted).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it('does not retry a failed single-use relay claim', async () => {
      vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(fetchConnectRequest('https://relay.example/request', REQUEST_KEY))
        .rejects.toThrow('Failed to fetch');

      expect(fetch).toHaveBeenCalledOnce();
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
    it.each(['authenticate', 'connect'] as const)('keeps one relay consent snapshot through asynchronous %s approval, sealing and completion', async (requestType) => {
      const request = connectRequest({ requestType,
        authentication: { version: 1, audience: 'https://auth.example/', challenge: 'c'.repeat(32) },
      });
      mocks.openRequest.mockResolvedValue(request);
      const fetched = await fetchConnectRequest('https://auth.example/request/one', REQUEST_KEY);
      const original = structuredClone(fetched);
      const overrides = ['https://example.test/original-module'];
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const execute = requestType === 'authenticate' ? mocks.executeConnectAuthentication : mocks.executeConnectApproval;
      execute.mockImplementationOnce(async () => {
        entered(); await pending;
        return { authenticationProof: 'proof-for-original-request', responseSigner: {} };
      });
      const result = approveConnectRequest('did:dht:owner', fetched, '1234', 3600, {} as any, overrides);
      await started;
      fetched.state = 'mutated-state'; fetched.nonce = 'mutated-nonce';
      fetched.authentication!.challenge = 'z'.repeat(32);
      fetched.reply = { mode: 'direct_post', callbackUrl: 'https://other.example/callback' };
      fetched.responseKey.x = 'mutated-public-key'; overrides.push('https://other.example/module');
      release();
      const completed = await result;
      expect(completed).toEqual(original);
      expect(completed).not.toBe(fetched);
      const seal = requestType === 'authenticate' ? mocks.sealAuthenticationResponse : mocks.sealApprovedResponse;
      expect(seal).toHaveBeenCalledWith(expect.objectContaining({ request: original }));
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ request: original, verifiedRequesterOrigin: 'https://auth.example' }));
      if (requestType === 'connect') {
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ approvedModuleOverrides: ['https://example.test/original-module'] }));
      }
      expect(mocks.postRelayResponse).toHaveBeenCalledWith(expect.objectContaining({ state: original.state, callbackUrl: original.reply.callbackUrl }));
      await waitForRelayCompletion(completed);
      expect(mocks.pollRelayComplete).toHaveBeenCalledWith({ callbackUrl: original.reply.callbackUrl, state: original.state });
    });

    it('keeps invalid relay context in the Effect and Promise failure channels', async () => {
      const request = connectRequest({ requestType: 'authenticate',
        authentication: { version: 1, audience: 'https://auth.example/', challenge: 'c'.repeat(32) } });
      expect(() => approveConnectRequestEffect('did:dht:owner', request, '1234', 3600)).not.toThrow();
      let rejected!: Promise<unknown>;
      expect(() => { rejected = approveConnectRequest('did:dht:owner', request, '1234', 3600, {} as any); }).not.toThrow();
      await expect(rejected).rejects.toThrow('fresh request from the authentication service');
      expect(mocks.executeConnectAuthentication).not.toHaveBeenCalled();
    });

    it('authenticates a fetched request without running the DWN grant ceremony', async () => {
      mocks.openRequest.mockResolvedValue(connectRequest({
        requestType: 'authenticate',
        authentication: { version: 1, audience: 'https://auth.example/', challenge: 'c'.repeat(32) },
      }));
      const request = await fetchConnectRequest('https://auth.example/request/one', REQUEST_KEY);
      const agent = { id: 'agent-1' } as any;
      await approveConnectRequest('did:dht:owner', request, '1234', 3600, agent);
      expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
      expect(mocks.executeConnectAuthentication).toHaveBeenCalledWith({
        agent, providerDid: 'did:dht:owner', request, verifiedRequesterOrigin: 'https://auth.example',
      });
      expect(mocks.sealAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
        request, pin: '1234', approval: expect.objectContaining({ authenticationProof: 'owner-proof' }),
      }));
      expect(mocks.postRelayResponse).toHaveBeenCalledWith(expect.objectContaining({
        idToken: 'sealed-authentication-jwe', state: request.state,
      }));
    });

    it('refuses authentication when the verified relay request context was lost', async () => {
      const request = connectRequest({
        requestType: 'authenticate',
        authentication: { version: 1, audience: 'https://auth.example/', challenge: 'c'.repeat(32) },
      });
      await expect(approveConnectRequest('did:dht:owner', request, '1234', 3600, {} as any))
        .rejects.toThrow('fresh request from the authentication service');
      expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
      expect(mocks.executeConnectAuthentication).not.toHaveBeenCalled();
      expect(mocks.postRelayResponse).not.toHaveBeenCalled();
    });
    it('runs the ceremony, seals with the PIN, and posts to the callback', async () => {
      const agent = { id: 'agent-1' } as any;
      const request = connectRequest({ requestedSessionTtlSeconds: 86_400 });
      const originalRequest = structuredClone(request);

      await approveConnectRequest(
        'did:dht:alice',
        request,
        '1234',
        3_600,
        agent,
        ['https://example.com/modules/tasks'],
      );

      expect(mocks.executeConnectApproval).toHaveBeenCalledWith({
        agent,
        approvedModuleOverrides : ['https://example.com/modules/tasks'],
        approvedSessionTtlSeconds : 3_600,
        providerDid               : 'did:dht:alice',
        request,
        transport                 : 'relay',
      });
      expect(mocks.sealApprovedResponse).toHaveBeenCalledWith({
        request,
        providerDid : 'did:dht:alice',
        approval    : expect.objectContaining({ delegateDid: 'did:jwk:delegate' }),
        signer      : { uri: 'did:jwk:delegate' },
        pin         : '1234',
      });
      expect(mocks.postRelayResponse).toHaveBeenCalledWith(expect.objectContaining({
        callbackUrl : 'https://relay.example/connect/callback',
        state       : 'state-1',
        idToken     : 'sealed-response-jwe',
        fetchFn     : expect.any(Function),
      }));
      // Seal happens before delivery, after the ceremony.
      expect(request).toEqual(originalRequest);
      expect(mocks.sealApprovedResponse.mock.calls[0][0].request).toEqual(request);
      expect(mocks.sealApprovedResponse.mock.calls[0][0].request).not.toBe(request);
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

    it('aborts callback delivery when its deadline expires', async () => {
      let deliverySignal: AbortSignal | undefined;
      vi.mocked(fetch).mockImplementation((_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          deliverySignal = init?.signal as AbortSignal;
          deliverySignal.addEventListener(
            'abort',
            () => reject(new DOMException('The operation was aborted', 'AbortError')),
            { once: true },
          );
        }));
      mocks.postRelayResponse.mockImplementation(async ({ callbackUrl, fetchFn }) => {
        await fetchFn(callbackUrl, { method: 'POST' });
      });
      const agent = { id: 'agent-1' } as any;

      const effect = approveConnectRequestEffect(
        'did:dht:alice',
        connectRequest(),
        '1234',
        3_600,
      ).pipe(
        Effect.provide(currentAgentLayer(agent)),
        Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
          retryTimes: 0,
          timeout: '1 millis',
        }))),
      );

      await expect(runEnboxPromise(effect)).rejects.toThrow('timed out');
      expect(deliverySignal?.aborted).toBe(true);
      expect(mocks.executeConnectApproval).toHaveBeenCalledOnce();
      expect(mocks.postRelayResponse).toHaveBeenCalledOnce();
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
    it.each(['authenticate', 'connect'] as const)('keeps the original popup request and approval options across asynchronous %s approval', async (requestType) => {
      const request = connectRequest({ requestType, reply: { mode: 'post_message' },
        authentication: { version: 1, audience: 'https://app.example/', challenge: 'c'.repeat(32) } });
      const original = structuredClone(request);
      const overrides = ['https://example.test/original-module'];
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const execute = requestType === 'authenticate' ? mocks.executeConnectAuthentication : mocks.executeConnectApproval;
      execute.mockImplementationOnce(async () => {
        entered(); await pending;
        return { authenticationProof: 'proof-for-original-request', responseSigner: {} };
      });
      const result = approvePopupConnectRequest('did:dht:owner', request, 'https://app.example', 3600, {} as any, overrides);
      await started;
      request.state = 'mutated-state'; request.authentication.audience = 'https://other.example/';
      request.responseKey.x = 'mutated-public-key'; overrides.push('https://other.example/module');
      release(); await result;
      const seal = requestType === 'authenticate' ? mocks.sealAuthenticationResponse : mocks.sealApprovedResponse;
      expect(seal).toHaveBeenCalledWith(expect.objectContaining({ request: original }));
      expect(execute).toHaveBeenCalledWith(expect.objectContaining({ request: original, verifiedRequesterOrigin: 'https://app.example' }));
      if (requestType === 'connect') {
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ approvedModuleOverrides: ['https://example.test/original-module'] }));
      }
    });

    it('uses the verified popup origin and signs only an authentication response', async () => {
      const request = connectRequest({
        requestType: 'authenticate', reply: { mode: 'post_message' },
        authentication: { version: 1, audience: 'https://app.example/', challenge: 'c'.repeat(32) },
      });
      await expect(approvePopupConnectRequest('did:dht:owner', request, 'https://app.example', 3600, {} as any))
        .resolves.toBe('sealed-authentication-jwe');
      expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
      expect(mocks.executeConnectAuthentication).toHaveBeenCalledWith(expect.objectContaining({
        request, verifiedRequesterOrigin: 'https://app.example',
      }));
    });

    it('rejects a sign-in audience outside the verified popup origin before approving', async () => {
      const request = connectRequest({
        requestType: 'authenticate', reply: { mode: 'post_message' },
        authentication: { version: 1, audience: 'https://other.example/', challenge: 'c'.repeat(32) },
      });
      await expect(approvePopupConnectRequest('did:dht:owner', request, 'https://app.example', 3600, {} as any))
        .rejects.toThrow('sign-in service does not match');
      expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
      expect(mocks.executeConnectAuthentication).not.toHaveBeenCalled();
    });

    it('preserves the wire request for combined proof binding while passing verified origin separately', async () => {
      const request = connectRequest({
        reply: { mode: 'post_message' },
        authentication: { version: 1, audience: 'https://app.example/', challenge: 'c'.repeat(32) },
      });
      const original = structuredClone(request);
      await approvePopupConnectRequest('did:dht:owner', request, 'https://app.example', 3600, {} as any);
      expect(mocks.executeConnectApproval).toHaveBeenCalledWith(expect.objectContaining({
        request: original, verifiedRequesterOrigin: 'https://app.example',
      }));
      expect(request).toEqual(original);
      expect(mocks.executeConnectAuthentication).not.toHaveBeenCalled();
    });
    it('passes the transport origin separately for permission-only approval and seals the original request', async () => {
      const agent = { id: 'agent-1' } as any;
      const request = connectRequest({ reply: { mode: 'post_message' } });
      const originalRequest = structuredClone(request);

      await expect(
        approvePopupConnectRequest(
          'did:dht:alice',
          request,
          'https://app.example',
          604_800,
          agent,
          ['https://example.com/modules/tasks'],
        ),
      ).resolves.toBe('sealed-response-jwe');

      expect(mocks.executeConnectApproval).toHaveBeenCalledWith({
        agent,
        approvedModuleOverrides : ['https://example.com/modules/tasks'],
        approvedSessionTtlSeconds : 604_800,
        providerDid               : 'did:dht:alice',
        request                   : originalRequest,
        verifiedRequesterOrigin   : 'https://app.example',
        transport                 : 'postMessage',
      });
      expect(mocks.executeConnectApproval.mock.calls[0][0].request)
        .not.toHaveProperty('requestedSessionTtlSeconds');
      const sealArgs = mocks.sealApprovedResponse.mock.calls[0][0];
      expect(sealArgs.request).toEqual(request);
      expect(sealArgs.request).not.toBe(request);
      expect(sealArgs.pin).toBeUndefined();
      expect(request).toEqual(originalRequest);
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

      expect(mocks.postRelayResponse).toHaveBeenCalledWith(expect.objectContaining({
        callbackUrl : 'https://relay.example/connect/callback',
        state       : 'state-1',
        idToken     : 'DENIED',
        fetchFn     : expect.any(Function),
      }));
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
