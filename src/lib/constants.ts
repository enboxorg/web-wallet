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
  try {
    const stored = localStorage.getItem(AUTO_LOCK_STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!isNaN(val) && val >= 0) return val;
    }
  } catch {}
  return DEFAULT_AUTO_LOCK_MS;
}

/** @deprecated Use `getAutoLockTimeout()` instead. */
export const INACTIVITY_TIMEOUT_MS = DEFAULT_AUTO_LOCK_MS;

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
