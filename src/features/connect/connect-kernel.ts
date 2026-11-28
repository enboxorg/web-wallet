import { Effect } from 'effect';
import type { ExecuteConnectApprovalParams } from '@enbox/agent';
import { executeConnectApproval, executeConnectAuthentication } from '@enbox/agent';
import {
  assertValidRedirectUri,
  assertX25519PublicJwk,
  buildRedirectReturnUri,
  CONNECT_DENIED_TOKEN,
  ConnectProvider,
  createConnectVerificationHandshake,
  fetchConnectAppManifest,
  generateRedirectResponseSecret,
  isRedirectUriVerifiedInManifest,
  pollRelayComplete,
  postRelayHandshake,
  postRelayResponse,
  type ConnectRequest,
  type ConnectVerificationHandshake,
} from '@enbox/connect';
import type { Jwk } from '@enbox/crypto';

import { sdkError } from '@/enbox/effect/errors';
import {
  fetchWithEffectSignal,
  withNetworkDeadline,
  withNetworkPolicy,
} from '@/enbox/effect/network-policy';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { CurrentAgent, currentAgentLayer } from '@/enbox/effect/services';
import type { EnboxAgent } from '@/enbox/types';

function sdkTimeout(operation: string) {
  return sdkError(operation)(new Error(`${operation} timed out`));
}

const LOCAL_RELAY_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_CONNECT_RESPONSE_BYTES = 2_000_000;
const relayRequestOrigins = new WeakMap<ConnectRequest, string>();
const relayRequestJwes = new WeakMap<ConnectRequest, string>();
const relayHandshakes = new WeakMap<ConnectRequest, Promise<ConnectVerificationHandshake>>();
const relayHandshakePublishes = new WeakMap<ConnectRequest, Promise<ConnectVerificationHandshake>>();

export interface ConnectApprovalOptions {
  onProgress?: ExecuteConnectApprovalParams['onProgress'];
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Snapshot at API entry, but keep invalid input in the Effect/Promise error channel. */
function captureApprovalInput<T>(operation: string, capture: () => T) {
  try {
    return Effect.succeed(capture());
  } catch (error) {
    return Effect.fail(sdkError(operation)(error));
  }
}

/** Approve and seal one captured request; only callback delivery may be retried. */
async function approveAndSeal({ handshakeKey, responseSecret, ...params }: ExecuteConnectApprovalParams & {
  request: ConnectRequest;
  handshakeKey?: Jwk;
  responseSecret?: Uint8Array;
}): Promise<string> {
  const { agent, providerDid, request, verifiedRequesterOrigin } = params;
  if (request.requestType === 'authenticate') {
    if (verifiedRequesterOrigin === undefined) {
      throw new Error('Sign-in request origin is unavailable.');
    }
    const approval = await executeConnectAuthentication({ agent, providerDid, request, verifiedRequesterOrigin });
    return ConnectProvider.sealAuthenticationResponse({
      request, providerDid, approval, signer: approval.responseSigner, handshakeKey, responseSecret,
    });
  }
  const approval = await executeConnectApproval(params);
  return ConnectProvider.sealApprovedResponse({
    request, providerDid, approval, signer: approval.responseSigner, handshakeKey, responseSecret,
  });
}

/** The request's HTTPS origin is established by its non-redirecting fetch. */
export function getRelayAuthenticationOrigin(request: ConnectRequest): string | undefined {
  if (request.authentication === undefined) return undefined;
  const origin = relayRequestOrigins.get(request);
  if (origin === undefined) {
    throw new Error('Sign-in requires a fresh request from the authentication service.');
  }
  assertConnectAuthenticationOrigin(request, origin);
  if (request.reply.mode === 'redirect') {
    const redirectOrigin = new URL(request.reply.redirectUri).origin;
    if (redirectOrigin !== origin) {
      throw new Error('The sign-in redirect destination does not match the requesting origin.');
    }
  }
  return origin;
}

/** Authentication claims must agree with the origin established by the transport. */
export function assertConnectAuthenticationOrigin(request: ConnectRequest, origin: string): void {
  if (request.authentication !== undefined &&
      (!isTrustedDappOrigin(origin) || new URL(request.authentication.audience).origin !== origin)) {
    throw new Error('The sign-in service does not match the requesting origin.');
  }
}

/**
 * Wallet policy: connect relay URLs must be HTTPS (or a local development
 * origin), carry no credentials, and have no fragment. The kernel's relay
 * helpers deliberately leave transport policy to the caller.
 */
function parseConnectUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  const isLocalHttp = import.meta.env.DEV
    && url.protocol === 'http:'
    && LOCAL_RELAY_HOSTS.has(url.hostname);
  if (
    (url.protocol !== 'https:' && !isLocalHttp)
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
  ) {
    throw new Error(`${label} must use HTTPS or a local development origin.`);
  }
  return url;
}

async function readBoundedResponseText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CONNECT_RESPONSE_BYTES) {
    throw new Error('Connect request response is too large.');
  }
  if (response.body === null) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_CONNECT_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('Connect request response is too large.');
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Returns the relay callback URL from an opened connect request, enforcing
 * the wallet's URL policy. Both cross-device (`direct_post`) and same-device
 * hybrid (`redirect`) requests post their sealed response to `callbackUrl`;
 * popup (`post_message`) requests cannot arrive through the relay.
 */
export function getRelayCallbackUrl(request: ConnectRequest): string {
  if (request.reply.mode !== 'direct_post' && request.reply.mode !== 'redirect') {
    throw new Error('The connection request does not use the relay reply mode.');
  }
  parseConnectUrl(request.reply.callbackUrl, 'Connect callback URL');
  if (request.reply.mode === 'redirect') {
    getRedirectReturnTarget(request);
  }
  return request.reply.callbackUrl;
}

/**
 * Returns the validated `redirectUri` when a request uses `reply.mode = 'redirect'`,
 * enforcing protocol-level redirect URI rules (no query string, no credentials,
 * no fragment) and the wallet's trusted origin policy (HTTPS or loopback localhost).
 */
export function getRedirectReturnTarget(request: ConnectRequest): string | undefined {
  if (request.reply.mode !== 'redirect') {
    return undefined;
  }
  assertValidRedirectUri(request.reply.redirectUri);
  const parsed = new URL(request.reply.redirectUri);
  if (!isTrustedDappOrigin(parsed.origin)) {
    throw new Error('Connect redirect URI must use HTTPS or a local development origin.');
  }
  return request.reply.redirectUri;
}

/**
 * Checks whether a `redirect` request's `redirectUri` is explicitly allowlisted
 * in `https://<origin>/.well-known/enbox-app` (fetched with `redirect: 'error'`).
 * Never throws: absent, unreachable, redirected, or malformed manifests simply
 * report `verified: false` so the consent UI displays a neutral return target.
 */
export async function verifyRedirectAppOrigin(
  request: ConnectRequest,
): Promise<{ origin: string; verified: boolean } | undefined> {
  let redirectUri: string | undefined;
  try {
    redirectUri = getRedirectReturnTarget(request);
  } catch {
    return undefined;
  }
  if (redirectUri === undefined) {
    return undefined;
  }
  const origin = new URL(redirectUri).origin;
  try {
    const manifest = await fetchConnectAppManifest(origin);
    return {
      origin,
      verified: isRedirectUriVerifiedInManifest(redirectUri, manifest),
    };
  } catch {
    return { origin, verified: false };
  }
}

/**
 * Builds the redirect return URL signalling user denial (`#enbox_state=...&enbox_error=denied`).
 */
export function buildRedirectDenialUrl(request: ConnectRequest): string | undefined {
  const redirectUri = getRedirectReturnTarget(request);
  if (redirectUri === undefined) {
    return undefined;
  }
  return buildRedirectReturnUri({
    redirectUri,
    state : request.state,
    error : 'denied',
  });
}

/**
 * Navigates the current browsing context to a validated redirect return URL.
 * Validates the pre-hash URL as defense-in-depth and uses `location.replace`
 * so `/connect/app` is not stranded in mobile browser Back history.
 */
export function navigateToRedirectReturn(returnUrl: string): void {
  const hashIndex = returnUrl.indexOf('#');
  const baseUrl = hashIndex === -1 ? returnUrl : returnUrl.slice(0, hashIndex);
  assertValidRedirectUri(baseUrl);
  const parsed = new URL(baseUrl);
  if (!isTrustedDappOrigin(parsed.origin)) {
    throw new Error('Connect redirect return URL must use HTTPS or a local development origin.');
  }
  window.location.replace(returnUrl);
}

/**
 * Fetches and opens a relayed connect request: wallet-policy URL validation
 * and a size-bounded fetch of the single-use request pointer, then the kernel
 * opens the JWE (decrypt, JWT verification, signer/clientDid binding, shape
 * assertion) with the fragment-supplied 32-byte request key.
 */
async function getBoundConnectRequest(
  requestUri: string,
  requestKey: Uint8Array,
  signal: AbortSignal,
): Promise<ConnectRequest> {
  const requestUrl = parseConnectUrl(requestUri, 'Connect request URI');
  const response = await fetchWithEffectSignal(signal, requestUrl, { redirect: 'error' });
  if (response.status === 404 || response.status === 410) {
    // The relay pointer is single-use and expires server-side: a 404/410 is
    // definitive (already claimed, expired, or the relay lost it) — retrying
    // cannot succeed, so the message deliberately avoids the retryable-error
    // keywords the network policy matches on.
    throw new Error(
      'This connection code was already used or has expired. Get a fresh code from the app and scan it again.',
    );
  }
  if (!response.ok) {
    throw new Error(`Connect request fetch failed (${response.status}).`);
  }

  const jwe = await readBoundedResponseText(response);
  const request = await ConnectProvider.openRequest({
    jwe,
    decryption: { mode: 'dir', requestKey },
  });
  getRelayCallbackUrl(request);
  relayRequestOrigins.set(request, requestUrl.origin);
  relayRequestJwes.set(request, jwe);
  getRelayAuthenticationOrigin(request);

  return request;
}

export function fetchConnectRequestEffect(requestUri: string, requestKey: Uint8Array) {
  return withNetworkDeadline(
    'connect.getConnectRequest',
    Effect.tryPromise({
      try: (signal) => getBoundConnectRequest(requestUri, requestKey, signal),
      catch: sdkError('connect.getConnectRequest'),
    }),
    () => sdkTimeout('connect.getConnectRequest'),
  );
}

export function fetchConnectRequest(
  requestUri: string,
  requestKey: Uint8Array,
): Promise<ConnectRequest> {
  return runEnboxPromise(fetchConnectRequestEffect(requestUri, requestKey));
}

/**
 * Creates the wallet's pre-approval SAS verification handshake for a fetched
 * relayed request and publishes its ephemeral `walletEpk` to the relay
 * (`POST /connect/handshake`) so the requesting app can derive and display
 * the 3 verification symbols before the user approves.
 *
 * The derived handshake (`walletEpk`, targets, and shuffled 3×3 grid) is
 * memoized per fetched `ConnectRequest` so retries reuse the same `walletEpk`
 * (matching the relay's first-write-wins idempotency semantics).
 */
export function startRelayVerificationHandshakeEffect(request: ConnectRequest) {
  const prepared = captureApprovalInput('connect.handshake', () => {
    if (request.reply.mode !== 'direct_post') {
      throw new Error('SAS verification handshake is only used for direct_post relay requests.');
    }
    const requestJwe = relayRequestJwes.get(request);
    if (requestJwe === undefined) {
      throw new Error('Verification requires a fresh relayed connection request.');
    }
    const capturedRequest = structuredClone(request);
    const callbackUrl = getRelayCallbackUrl(capturedRequest);
    return { request: capturedRequest, requestJwe, callbackUrl };
  });

  return Effect.gen(function* () {
    const { request: capturedRequest, requestJwe, callbackUrl } = yield* prepared;
    let handshakePromise = relayHandshakes.get(request);
    if (handshakePromise === undefined) {
      handshakePromise = createConnectVerificationHandshake({
        request: capturedRequest,
        requestJwe,
      });
      relayHandshakes.set(request, handshakePromise);
      void handshakePromise.catch(() => {
        if (relayHandshakes.get(request) === handshakePromise) {
          relayHandshakes.delete(request);
        }
      });
    }

    const handshake = yield* Effect.tryPromise({
      try: () => handshakePromise,
      catch: sdkError('connect.handshake'),
    });

    yield* withNetworkPolicy(
      'connect.handshake',
      Effect.tryPromise({
        try: (signal) => postRelayHandshake({
          callbackUrl,
          state     : capturedRequest.state,
          walletEpk : handshake.walletEpk,
          fetchFn   : (input, init) => fetchWithEffectSignal(signal, input, init),
        }),
        catch: sdkError('connect.handshake'),
      }),
      () => sdkTimeout('connect.handshake'),
    );

    return handshake;
  });
}

export function startRelayVerificationHandshake(
  request: ConnectRequest,
): Promise<ConnectVerificationHandshake> {
  const existing = relayHandshakePublishes.get(request);
  if (existing !== undefined) {
    return existing;
  }
  const promise = runEnboxPromise(startRelayVerificationHandshakeEffect(request));
  relayHandshakePublishes.set(request, promise);
  void promise.catch(() => {
    if (relayHandshakePublishes.get(request) === promise) {
      relayHandshakePublishes.delete(request);
    }
  });
  return promise;
}

/** Releases cached single-use SAS handshake state once verification has been consumed. */
export function clearRelayVerificationHandshake(request: ConnectRequest): void {
  relayHandshakes.delete(request);
  relayHandshakePublishes.delete(request);
}

/** Shared non-idempotent approval + retry-safe callback POST for `direct_post` and `redirect`. */
function executeAndPostRelayApprovalEffect({
  channel,
  callbackUrl,
  handshakeKey,
  responseSecret,
  ...captured
}: Omit<ExecuteConnectApprovalParams, 'agent' | 'transport'> & {
  channel: 'relay' | 'redirect';
  callbackUrl: string;
  request: ConnectRequest;
  handshakeKey?: Jwk;
  responseSecret?: Uint8Array;
}) {
  return Effect.gen(function* () {
    const { request } = captured;
    const agent = yield* CurrentAgent;
    const totalStart = nowMs();
    const idToken = yield* Effect.tryPromise({
      try: async () => {
        const sealStart = nowMs();
        const sealed = await approveAndSeal({
          ...captured,
          agent,
          transport: 'relay',
          ...(handshakeKey === undefined ? {} : { handshakeKey }),
          ...(responseSecret === undefined ? {} : { responseSecret }),
        });
        console.debug(
          `[connect.perf] ${channel}.approveAndSeal ok in ${(nowMs() - sealStart).toFixed(1)}ms`,
        );
        return sealed;
      },
      catch: sdkError('connect.submitConnectResponse'),
    });

    const postStart = nowMs();
    yield* withNetworkPolicy(
      'connect.submitConnectResponse',
      Effect.tryPromise({
        try: async (signal) => postRelayResponse({
          callbackUrl,
          state: request.state,
          idToken,
          fetchFn: (input, init) => fetchWithEffectSignal(signal, input, init),
        }),
        catch: sdkError('connect.submitConnectResponse'),
      }),
      () => sdkTimeout('connect.submitConnectResponse'),
    );
    console.debug(
      `[connect.perf] ${channel}.postResponse ok in ${(nowMs() - postStart).toFixed(1)}ms `
      + `(total=${(nowMs() - totalStart).toFixed(1)}ms)`,
    );
    return request;
  });
}

/**
 * Runs the agent's connect approval ceremony for a relayed request and posts
 * the sealed response to the request's callback: delegate mint (or
 * pre-supplied delegate validation), module preparation, grant creation and
 * delivery, encrypted-read grant keys, and session revocation grants all
 * happen inside `executeConnectApproval`; `handshakeKey` (`walletEpk`) is
 * bound into the response JWE's integrity-protected `apv` header so an
 * untrusted relay cannot split-view a different SAS handshake key.
 *
 * The ceremony itself is deliberately NOT wrapped in the retrying network
 * policy: it is not idempotent (it mints a delegate and writes grants — a
 * retry would duplicate them) and it enforces its own per-request delivery
 * budgets internally. Only the final, replay-tolerant callback POST rides
 * the network policy.
 */
export function approveConnectRequestEffect(
  selectedDid: string,
  request: ConnectRequest,
  handshakeKey: Jwk,
  approvedSessionTtlSeconds: number,
  approvedModuleOverrides: readonly string[] = [],
  options?: ConnectApprovalOptions,
) {
  const prepared = captureApprovalInput('connect.submitConnectResponse', () => {
    // Only the original fetched object carries the verified relay origin.
    // Do not grant origin authority to arbitrary cloned requests.
    const verifiedRequesterOrigin = getRelayAuthenticationOrigin(request);
    const capturedRequest = structuredClone(request);
    if (capturedRequest.reply.mode !== 'direct_post') {
      throw new Error('The connection request does not use the direct_post relay reply mode.');
    }
    const capturedHandshakeKey = structuredClone(handshakeKey);
    assertX25519PublicJwk(capturedHandshakeKey);
    if (verifiedRequesterOrigin !== undefined) {
      assertConnectAuthenticationOrigin(capturedRequest, verifiedRequesterOrigin);
    }
    return {
      request: capturedRequest,
      handshakeKey: capturedHandshakeKey,
      ...(verifiedRequesterOrigin === undefined ? {} : { verifiedRequesterOrigin }),
      callbackUrl: getRelayCallbackUrl(capturedRequest),
      approvedModuleOverrides: [...approvedModuleOverrides],
      providerDid: selectedDid,
      approvedSessionTtlSeconds,
      ...(options?.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    };
  });
  return Effect.flatMap(prepared, (captured) =>
    executeAndPostRelayApprovalEffect({ ...captured, channel: 'relay' }),
  );
}

export function approveConnectRequest(
  selectedDid: string,
  request: ConnectRequest,
  handshakeKey: Jwk,
  approvedSessionTtlSeconds: number,
  agent: EnboxAgent,
  approvedModuleOverrides: readonly string[] = [],
  options?: ConnectApprovalOptions,
): Promise<ConnectRequest> {
  return runEnboxPromise(
    approveConnectRequestEffect(
      selectedDid,
      request,
      handshakeKey,
      approvedSessionTtlSeconds,
      approvedModuleOverrides,
      options,
    ).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

/**
 * Runs the approval ceremony for a same-device hybrid `redirect` request:
 * generates a fresh 256-bit `responseSecret`, seals the response JWE under
 * BOTH `request.responseKey` and `responseSecret`, posts it to `callbackUrl`,
 * and returns the fragment-bearing `returnUrl` (`#enbox_state=...&enbox_key=...`)
 * for the wallet to navigate back to the requesting app.
 */
export function approveRedirectConnectRequestEffect(
  selectedDid: string,
  request: ConnectRequest,
  approvedSessionTtlSeconds: number,
  approvedModuleOverrides: readonly string[] = [],
  options?: ConnectApprovalOptions,
) {
  const prepared = captureApprovalInput('connect.submitConnectResponse', () => {
    if (request.reply.mode !== 'redirect') {
      throw new Error('The connection request does not use the redirect reply mode.');
    }
    if (typeof request.state !== 'string' || request.state.length === 0) {
      throw new Error('The connection request is missing a valid state parameter.');
    }
    if (request.delegateDid !== undefined && request.requestType !== 'refresh') {
      throw new Error('Redirect connection requests cannot supply a pre-existing delegate DID.');
    }
    const verifiedRequesterOrigin = getRelayAuthenticationOrigin(request);
    const capturedRequest = structuredClone(request);
    const callbackUrl = getRelayCallbackUrl(capturedRequest);
    const redirectUri = getRedirectReturnTarget(capturedRequest)!;
    if (verifiedRequesterOrigin !== undefined) {
      assertConnectAuthenticationOrigin(capturedRequest, verifiedRequesterOrigin);
    }
    const responseSecret = generateRedirectResponseSecret();
    const returnUrl = buildRedirectReturnUri({
      redirectUri,
      state: capturedRequest.state,
      responseSecret,
    });
    return {
      request: capturedRequest,
      ...(verifiedRequesterOrigin === undefined ? {} : { verifiedRequesterOrigin }),
      callbackUrl,
      responseSecret,
      returnUrl,
      approvedModuleOverrides: [...approvedModuleOverrides],
      providerDid: selectedDid,
      approvedSessionTtlSeconds,
      ...(options?.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    };
  });

  return Effect.gen(function* () {
    const { returnUrl, responseSecret, ...captured } = yield* prepared;
    const completedRequest = yield* executeAndPostRelayApprovalEffect({
      ...captured,
      channel: 'redirect',
      responseSecret,
    });
    return { request: completedRequest, returnUrl };
  });
}

export function approveRedirectConnectRequest(
  selectedDid: string,
  request: ConnectRequest,
  approvedSessionTtlSeconds: number,
  agent: EnboxAgent,
  approvedModuleOverrides: readonly string[] = [],
  options?: ConnectApprovalOptions,
): Promise<{ request: ConnectRequest; returnUrl: string }> {
  return runEnboxPromise(
    approveRedirectConnectRequestEffect(
      selectedDid,
      request,
      approvedSessionTtlSeconds,
      approvedModuleOverrides,
      options,
    ).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

/**
 * Waits for the requesting app to confirm that it opened the relayed
 * response. The completion marker is observational and best-effort:
 * unsupported relays and an elapsed polling budget resolve `false`.
 */
export function waitForRelayCompletion(request: ConnectRequest): Promise<boolean> {
  return pollRelayComplete({
    callbackUrl : getRelayCallbackUrl(request),
    state       : request.state,
  });
}

/**
 * Wallet policy: a dapp origin must be a well-formed HTTPS origin (or plain
 * localhost for development). The popup transport pins the origin it talks
 * to, but does not impose a scheme policy — that is the wallet's call.
 */
export function isTrustedDappOrigin(origin: string): boolean {
  if (!origin || origin === 'null') return false;
  try {
    const url = new URL(origin);
    if (url.origin !== origin) return false;
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && LOCAL_RELAY_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Runs the approval ceremony for a popup (postMessage) request and returns
 * the sealed response JWE for the page to hand to
 * `WalletPostMessageTransport.sendResponse`. The SDK receives the verified
 * dapp origin separately for stored session metadata. The original request
 * remains intact for proof binding and response sealing; popup responses use
 * no SAS handshake key because the transport pins the requesting origin.
 *
 * Like the relay path, the non-idempotent ceremony runs without the retrying
 * network policy (see `approveConnectRequestEffect`).
 */
export function approvePopupConnectRequestEffect(
  selectedDid: string,
  request: ConnectRequest,
  dappOrigin: string,
  approvedSessionTtlSeconds: number,
  approvedModuleOverrides: readonly string[] = [],
  options?: ConnectApprovalOptions,
) {
  const prepared = captureApprovalInput('dwebConnect.submitConnectResponse', () => {
    if (!isTrustedDappOrigin(dappOrigin)) {
      throw new Error('The requesting application origin is unavailable.');
    }
    assertConnectAuthenticationOrigin(request, dappOrigin);
    const capturedRequest = structuredClone(request);
    assertConnectAuthenticationOrigin(capturedRequest, dappOrigin);
    return {
      request: capturedRequest,
      approvedModuleOverrides: [...approvedModuleOverrides],
      providerDid: selectedDid,
      approvedSessionTtlSeconds,
      verifiedRequesterOrigin: dappOrigin,
      ...(options?.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    };
  });
  return Effect.gen(function* () {
    const captured = yield* prepared;
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => {
        const sealStart = nowMs();
        const sealed = await approveAndSeal({ ...captured, agent, transport: 'postMessage' });
        console.debug(
          `[connect.perf] popup.approveAndSeal ok in ${(nowMs() - sealStart).toFixed(1)}ms`,
        );
        return sealed;
      },
      catch: sdkError('dwebConnect.submitConnectResponse'),
    });
  });
}

export function approvePopupConnectRequest(
  selectedDid: string,
  request: ConnectRequest,
  dappOrigin: string,
  approvedSessionTtlSeconds: number,
  agent: EnboxAgent,
  approvedModuleOverrides: readonly string[] = [],
  options?: ConnectApprovalOptions,
): Promise<string> {
  return runEnboxPromise(
    approvePopupConnectRequestEffect(
      selectedDid,
      request,
      dappOrigin,
      approvedSessionTtlSeconds,
      approvedModuleOverrides,
      options,
    ).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function denyConnectRequestEffect(callbackUrl: string, state: string) {
  return withNetworkPolicy(
    'connect.deny',
    Effect.tryPromise({
      try: async (signal) => {
        parseConnectUrl(callbackUrl, 'Connect callback URL');
        await postRelayResponse({
          callbackUrl,
          state,
          idToken: CONNECT_DENIED_TOKEN,
          fetchFn: (input, init) => fetchWithEffectSignal(signal, input, init),
        });
      },
      catch: sdkError('connect.deny'),
    }),
    () => sdkTimeout('connect.deny'),
  );
}

export function denyConnectRequest(callbackUrl: string, state: string): Promise<void> {
  return runEnboxPromise(denyConnectRequestEffect(callbackUrl, state));
}
