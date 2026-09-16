import { getUnknownErrorMessage } from '@/enbox/effect/errors';

const GRANT_DELIVERY_ERROR =
  'Could not write the approved permission grants to any DWN endpoint for this identity. Check the identity DWN endpoints and try again.';

/**
 * Normalizes errors crossing SDK, browser, and transport boundaries before
 * they reach connect UI state, then translates the one low-level delivery
 * failure that needs wallet-specific guidance.
 */
export function getConnectErrorMessage(error: unknown, fallback: string): string {
  const message = getUnknownErrorMessage(error, fallback);
  if (/Could not send permission grant to any DWN endpoint/i.test(message)) {
    return GRANT_DELIVERY_ERROR;
  }
  return message;
}
