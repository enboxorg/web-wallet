import { Effect } from 'effect';
import { executeConnectApproval } from '@enbox/agent';
import {
  CONNECT_DENIED_TOKEN,
  ConnectProvider,
  pollRelayComplete,
  postRelayResponse,
  type ConnectRequest,
} from '@enbox/connect';
import { CryptoUtils } from '@enbox/crypto';

import { sdkError } from '@/enbox/effect/errors';
import { withNetworkPolicy } from '@/enbox/effect/network-policy';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { CurrentAgent, currentAgentLayer } from '@/enbox/effect/services';
import type { EnboxAgent } from '@/enbox/types';

function sdkTimeout(operation: string) {
  return sdkError(operation)(new Error(`${operation} timed out`));
}

const LOCAL_RELAY_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const MAX_CONNECT_RESPONSE_BYTES = 2_000_000;

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
 * the wallet's URL policy. Relay requests must use the `direct_post` reply
 * mode — a popup (`post_message`) request cannot arrive through the relay.
 */
export function getRelayCallbackUrl(request: ConnectRequest): string {
  if (request.reply.mode !== 'direct_post') {
    throw new Error('The connection request does not use the relay reply mode.');
  }
  parseConnectUrl(request.reply.callbackUrl, 'Connect callback URL');
  return request.reply.callbackUrl;
}

/**
 * Fetches and opens a relayed connect request: wallet-policy URL validation
 * and a size-bounded fetch of the single-use request pointer, then the kernel
 * opens the JWE (decrypt, JWT verification, signer/clientDid binding, shape
 * assertion) with the fragment-supplied 32-byte request key.
 */
async function getBoundConnectRequest(requestUri: string, requestKey: Uint8Array): Promise<ConnectRequest> {
  const requestUrl = parseConnectUrl(requestUri, 'Connect request URI');
  const response = await fetch(requestUrl, {
    redirect : 'error',
    signal   : AbortSignal.timeout(30_000),
  });
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

  return request;
}

export function fetchConnectRequestEffect(requestUri: string, requestKey: Uint8Array) {
  return withNetworkPolicy(
    'connect.getConnectRequest',
    Effect.tryPromise({
      try: async () => getBoundConnectRequest(requestUri, requestKey),
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

export function generatePinEffect(length = 4) {
  return Effect.sync(() => CryptoUtils.randomPin({ length }));
}

export function generatePin(length = 4): Promise<string> {
  return runEnboxPromise(generatePinEffect(length));
}

/**
 * Runs the agent's connect approval ceremony for a relayed request and posts
 * the sealed response to the request's callback: delegate mint (or
 * pre-supplied delegate validation), protocol preparation, grant creation and
 * delivery, encrypted-read grant keys, and session revocation grants all
 * happen inside `executeConnectApproval`; the PIN strengthens the response
 * encryption key and never transits.
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
  pin: string,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const callbackUrl = getRelayCallbackUrl(request);
    const idToken = yield* Effect.tryPromise({
      try: async () => {
        const approval = await executeConnectApproval({
          agent,
          providerDid : selectedDid,
          request,
          transport   : 'relay',
        });
        return ConnectProvider.sealApprovedResponse({
          request,
          providerDid : selectedDid,
          approval,
          signer      : approval.responseSigner,
          pin,
        });
      },
      catch: sdkError('connect.submitConnectResponse'),
    });

    return yield* withNetworkPolicy(
      'connect.submitConnectResponse',
      Effect.tryPromise({
        try: async () => postRelayResponse({ callbackUrl, state: request.state, idToken }),
        catch: sdkError('connect.submitConnectResponse'),
      }),
      () => sdkTimeout('connect.submitConnectResponse'),
    );
  });
}

export function approveConnectRequest(
  selectedDid: string,
  request: ConnectRequest,
  pin: string,
  agent: EnboxAgent,
): Promise<void> {
  return runEnboxPromise(
    approveConnectRequestEffect(selectedDid, request, pin).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

/**
 * Waits for the requesting app to confirm that it opened the relayed
 * response. The completion marker is observational and best-effort:
 * unsupported relays and an elapsed polling budget resolve `false` so the
 * PIN screen can retain its manual Done fallback.
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
 * `WalletPostMessageTransport.sendResponse`. The request's claimed
 * `clientMetadata.origin` is overwritten with the transport-authenticated
 * dapp origin before it is stamped into the session metadata; popup responses
 * use no PIN — the sealed channel is origin-bound end to end.
 *
 * Like the relay path, the non-idempotent ceremony runs without the retrying
 * network policy (see `approveConnectRequestEffect`).
 */
export function approvePopupConnectRequestEffect(
  selectedDid: string,
  request: ConnectRequest,
  dappOrigin: string,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => {
        const approval = await executeConnectApproval({
          agent,
          providerDid : selectedDid,
          request     : {
            ...request,
            clientMetadata: { ...request.clientMetadata, origin: dappOrigin },
          },
          transport: 'postMessage',
        });
        return ConnectProvider.sealApprovedResponse({
          request,
          providerDid : selectedDid,
          approval,
          signer      : approval.responseSigner,
        });
      },
      catch: sdkError('dwebConnect.submitConnectResponse'),
    });
  });
}

export function approvePopupConnectRequest(
  selectedDid: string,
  request: ConnectRequest,
  dappOrigin: string,
  agent: EnboxAgent,
): Promise<string> {
  return runEnboxPromise(
    approvePopupConnectRequestEffect(selectedDid, request, dappOrigin).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function denyConnectRequestEffect(callbackUrl: string, state: string) {
  return withNetworkPolicy(
    'connect.deny',
    Effect.tryPromise({
      try: async () => {
        parseConnectUrl(callbackUrl, 'Connect callback URL');
        await postRelayResponse({ callbackUrl, state, idToken: CONNECT_DENIED_TOKEN });
      },
      catch: sdkError('connect.deny'),
    }),
    () => sdkTimeout('connect.deny'),
  );
}

export function denyConnectRequest(callbackUrl: string, state: string): Promise<void> {
  return runEnboxPromise(denyConnectRequestEffect(callbackUrl, state));
}
