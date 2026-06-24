import { isLoopbackCallbackUrl } from './cli-connect-messages';

/**
 * Deliver a CLI connect response (or denial) to the tool's loopback callback.
 *
 * The tool runs a short-lived HTTP server on `127.0.0.1:<port>` and the wallet
 * POSTs the JSON there. Non-loopback URLs are refused so a malicious request
 * can't exfiltrate the delegate key material to an arbitrary host. Returns
 * `false` (rather than throwing) when the callback is absent or unreachable —
 * the UI then falls back to showing the JSON for manual copy/paste.
 */
export async function postCliCallback(
  callbackUrl: string | undefined,
  responseJson: string,
): Promise<boolean> {
  if (!isLoopbackCallbackUrl(callbackUrl)) {
    return false;
  }

  try {
    const response = await fetch(callbackUrl, {
      method  : 'POST',
      mode    : 'cors',
      headers : { 'Content-Type': 'application/json' },
      body    : responseJson,
    });
    return response.ok;
  } catch {
    return false;
  }
}
