import { Effect } from 'effect';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageGetEffect } from './browser-effects';

/** Auto-lock timeout options in milliseconds. */
export const AUTO_LOCK_OPTIONS = [
  { label: '5 minutes', value: 5 * 60 * 1000 },
  { label: '10 minutes', value: 10 * 60 * 1000 },
  { label: '30 minutes', value: 30 * 60 * 1000 },
  { label: '1 hour', value: 60 * 60 * 1000 },
  { label: 'Never', value: 0 },
] as const;

/** Default auto-lock timeout. */
export const DEFAULT_AUTO_LOCK_MS = 10 * 60 * 1000;

/** localStorage key for auto-lock preference. */
export const AUTO_LOCK_STORAGE_KEY = 'enbox:autoLockTimeout';

/** Read the user's auto-lock timeout preference from localStorage. */
export function getAutoLockTimeout(): number {
  return runEnboxSync(getAutoLockTimeoutEffect());
}

export function getAutoLockTimeoutEffect() {
  return localStorageGetEffect(AUTO_LOCK_STORAGE_KEY).pipe(
    Effect.map((stored) => {
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 0) return val;
    }
      return DEFAULT_AUTO_LOCK_MS;
    }),
  );
}

/** @deprecated Use `getAutoLockTimeout()` instead. */
export const INACTIVITY_TIMEOUT_MS = DEFAULT_AUTO_LOCK_MS;

/** Sync interval for DWN background sync. */
export const SYNC_INTERVAL = '5m';

/** PIN length for wallet lock/unlock. */
export const PIN_LENGTH = 4;

/** Local storage key for the configured wallet unlock method. */
export const AUTH_METHOD_STORAGE_KEY = 'enbox:auth:method';

/** Local storage key for the encrypted passkey vault credential. */
export const PASSKEY_CREDENTIAL_STORAGE_KEY = 'enbox:auth:passkeyCredential';

/** Local storage keys. */
export const STORAGE_KEYS = {
  IDENTITIES: 'identities',
  REGISTRATION_TOKENS: 'enbox:registrationTokens',
  LOCAL_DWN_ENDPOINT: 'enbox:enbox:auth:localDwnEndpoint',
  WALLET_DWN_ENDPOINTS: 'enbox:walletDwnEndpoints',
  THEME: 'enbox:theme',
} as const;

/**
 * Session storage key for the cached vault password.
 *
 * sessionStorage is tab-scoped: survives same-tab refresh but is cleared
 * when the tab closes, and is never shared with other tabs or popups.
 * This lets returning users skip unlock re-entry on page refresh while
 * still requiring it for new tabs and after inactivity timeout.
 */
export const SESSION_VAULT_PASSWORD_KEY = 'enbox:session:vaultPassword';

/** @deprecated Use `SESSION_VAULT_PASSWORD_KEY` instead. */
export const SESSION_PIN_KEY = 'enbox:session:pin';
