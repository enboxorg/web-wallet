/**
 * Module-level deep-link connect ceremony state.
 *
 * A connect deep link (`/connect/app#request_uri=...&encryption_key=...`)
 * carries a single-use relay pointer whose remaining lifetime started ticking
 * when the dapp minted its QR code. Dereferencing it must happen as close to
 * the scan as possible: for a returning-but-locked wallet the unlock screen
 * sits between the scan and the consent UI, and every second spent there is a
 * second in which the pointer can expire (or a dev relay restart can drop it),
 * ending in a dead-end 404.
 *
 * `primeConnectDeepLink()` therefore runs at app boot — before React renders,
 * before the unlock ceremony — parses the fragment, scrubs it from the URL and
 * history, and starts the fetch immediately. The consent UI stays gated behind
 * unlock; only the sealed request retrieval is front-loaded. AppConnectPage
 * adopts the session (in flight or settled) whenever it mounts, which also
 * covers StrictMode double-effects and AuthGate re-branching mid-ceremony.
 */

import { parseWalletConnectUri, type ConnectRequest } from '@enbox/connect';

import { fetchConnectRequest } from './connect-kernel';
import {
  preflightConnectRequest,
  validateConnectPermissionSemantics,
} from './connect-request-preflight';

/** Outcome of fetching the sealed deep-link request. */
export type DeepLinkOutcome = { request: ConnectRequest } | { error: string };

/** One deep-link ceremony: the fetch promise plus its settled outcome. */
export type DeepLinkSession = { promise: Promise<DeepLinkOutcome>; settled?: DeepLinkOutcome };

// Module-cached deep-link session. The sealed pointer is single-use and
// the fragment is stripped from the URL after the first parse, so any
// consumer after the first (page remounts, StrictMode double-effects,
// AuthGate re-branching while inline onboarding flips the auth store)
// must adopt the in-flight or fetched request instead of falling back
// to the scanner or refetching a consumed pointer.
let deepLinkSession: DeepLinkSession | undefined;

/**
 * True when the current URL carries connect deep-link parameters.
 * Used by the AuthGate, which renders the ceremony without the app
 * shell for uninitialised wallets so a fresh phone that scanned a
 * dapp's QR can create its wallet inside the approval flow.
 */
export function hasSensitiveConnectFragment(): boolean {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return fragment.has('request_uri') || fragment.has('encryption_key');
}

/**
 * True while a deep-link ceremony is active or arriving: either the boot
 * priming already claimed the fragment into a session, or the fragment is
 * still on the URL. AuthGate branches on this rather than the raw fragment,
 * which the priming scrubs before React ever renders.
 */
export function hasActiveConnectDeepLink(): boolean {
  return deepLinkSession !== undefined || hasSensitiveConnectFragment();
}

/**
 * Claims the connect deep link from the current URL and starts fetching the
 * sealed request. Idempotent: returns the existing session when one is
 * already active, and `undefined` when the URL carries no deep link. Called
 * at boot (before unlock) and defensively from AppConnectPage's mount.
 */
export function primeConnectDeepLink(): DeepLinkSession | undefined {
  if (deepLinkSession !== undefined) {
    return deepLinkSession;
  }
  if (!hasSensitiveConnectFragment()) {
    return undefined;
  }

  let deepLink: { requestUri: string; encryptionKey: Uint8Array } | null = null;
  try {
    deepLink = parseWalletConnectUri(window.location.href) ?? null;
  } catch {
    // Fall through to the invalid-URI outcome below.
  }

  // Strip the sensitive fragment from the URL (and history) immediately.
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}`,
  );

  const promise: Promise<DeepLinkOutcome> = (async () => {
    if (!deepLink) {
      return { error: 'Invalid connection URI: missing request_uri or encryption_key' };
    }
    try {
      const request = await fetchConnectRequest(deepLink.requestUri, deepLink.encryptionKey);
      const preflight = preflightConnectRequest(request);
      await validateConnectPermissionSemantics(preflight);
      return { request };
    } catch (err) {
      console.error('Connect flow error:', err);
      return { error: (err as Error).message || 'Failed to process connection request.' };
    }
  })();

  const session: DeepLinkSession = { promise };
  deepLinkSession = session;
  void promise.then((outcome) => {
    session.settled = outcome;
  });

  return session;
}

/** The active deep-link session, if any. */
export function getConnectDeepLinkSession(): DeepLinkSession | undefined {
  return deepLinkSession;
}

/** Ends the deep-link ceremony (deny, done, or explicit retry). */
export function clearDeepLinkSession(): void {
  deepLinkSession = undefined;
}

/** Test-only: reset the module session between cases. */
export function __resetDeepLinkSessionForTests(): void {
  clearDeepLinkSession();
}
