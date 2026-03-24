/** Inactivity timeout before the wallet auto-locks (milliseconds). */
export const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Sync interval for DWN background sync. */
export const SYNC_INTERVAL = '5m';

/** PIN length for wallet lock/unlock. */
export const PIN_LENGTH = 4;

/** Local storage keys. */
export const STORAGE_KEYS = {
  IDENTITIES: 'identities',
  REGISTRATION_TOKENS: 'enbox:registrationTokens',
  LOCAL_DWN_ENDPOINT: 'enbox:enbox:auth:localDwnEndpoint',
  THEME: 'enbox:theme',
} as const;

/**
 * Session storage key for the cached PIN.
 *
 * sessionStorage is tab-scoped: survives same-tab refresh but is cleared
 * when the tab closes, and is never shared with other tabs or popups.
 * This lets returning users skip PIN re-entry on page refresh while
 * still requiring it for new tabs and after inactivity timeout.
 */
export const SESSION_PIN_KEY = 'enbox:session:pin';
