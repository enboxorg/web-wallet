/**
 * EnboxAuthProvider — core authentication provider for the wallet.
 *
 * DESIGN PRINCIPLE: Let the SDK manage sync. The SDK's AuthManager handles
 * identity registration, sync start/stop, WebSocket push/pull, agent DID
 * sync (for seed phrase recovery), and identity recovery from remote DWNs
 * automatically. We only intervene for:
 * - Post-session DWN tenant registration (restoreSession does not
 *   re-register tenants, so we do it on every unlock)
 * - Forgot-PIN recovery, where the existing local vault must be reset
 *   before a recovery phrase can initialize it with a new PIN
 * - Inactivity auto-lock timer
 * - Session PIN caching for same-tab refresh persistence
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AuthManager, requestLocalDwnDiscovery } from '@enbox/auth';

import { useAuthStore } from '@/stores/auth-store';
import { getAutoLockTimeout, SESSION_PIN_KEY, STORAGE_KEYS } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { ensureRegistration, getStoredTokens, storeTokens } from './registration';
import type { EnboxAgent } from './types';

// ── Local DWN discovery ────────────────────────────────────────────

const DWN_DISCOVERY_TIMEOUT_MS = 3_000;

// ── Session PIN helpers ────────────────────────────────────────────

function cacheSessionPin(pin: string): void {
  try { sessionStorage.setItem(SESSION_PIN_KEY, pin); } catch { /* noop */ }
}

function getCachedSessionPin(): string | null {
  try { return sessionStorage.getItem(SESSION_PIN_KEY); } catch { return null; }
}

function clearSessionPin(): void {
  try { sessionStorage.removeItem(SESSION_PIN_KEY); } catch { /* noop */ }
}

function clearAuthSessionStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith('enbox:enbox:auth:') && key !== STORAGE_KEYS.LOCAL_DWN_ENDPOINT) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch { /* noop */ }
}

// ── Context ────────────────────────────────────────────────────────

export interface EnboxAuthContextValue {
  connect: (password: string, dwnEndpoints?: string[]) => Promise<string | undefined>;
  unlock: (password: string) => Promise<void>;
  restore: (
    recoveryPhrase: string,
    password: string,
    dwnEndpoints?: string[],
    options?: RestoreOptions,
  ) => Promise<void>;
  lock: () => void;
  error: string | null;
  isLoading: boolean;
}

const EnboxAuthContext = createContext<EnboxAuthContextValue | null>(null);

export interface RestoreOptions {
  resetLocalVault?: boolean;
}

type ClearableStore = {
  clear: () => Promise<void>;
};

type RuntimeVault = {
  _store?: ClearableStore;
  _contentEncryptionKey?: unknown;
  _cachedInitialized?: boolean;
  _cachedPortableDid?: unknown;
  lock: () => Promise<void>;
};

type RuntimeSecretStore = {
  _store?: ClearableStore;
};

async function resetLocalVaultForPhraseRestore(auth: AuthManager): Promise<void> {
  const agent = auth.agent as EnboxAgent;

  await agent.sync.stopSync(2_000).catch(() => {});
  await agent.sync.clear().catch(() => {});
  agent.dwn.clearDelegateDecryptionKeys();

  const vault = agent.vault as unknown as RuntimeVault;
  const secretStore = agent.secrets as unknown as RuntimeSecretStore;

  await vault.lock().catch(() => {});
  if (!vault._store) {
    throw new Error('Local vault reset is unavailable in this SDK version.');
  }

  await Promise.all([
    vault._store.clear(),
    secretStore._store?.clear?.() ?? Promise.resolve(),
  ]);

  vault._contentEncryptionKey = undefined;
  vault._cachedInitialized = undefined;
  vault._cachedPortableDid = undefined;

  clearAuthSessionStorage();
  clearSessionPin();
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEnboxAuth(): EnboxAuthContextValue {
  const ctx = useContext(EnboxAuthContext);
  if (!ctx) throw new Error('useEnboxAuth must be used within <EnboxAuthProvider>');
  return ctx;
}

// ── Provider ───────────────────────────────────────────────────────

export const EnboxAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authManagerRef = useRef<AuthManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setInitialized, setUnlocked, lock: storeLock } = useAuthStore();
  const unlocked = useAuthStore((s) => s.unlocked);

  // ── Post-session: ensure DWN tenant registration ─────────────────

  const ensurePostSession = useCallback(async (agent: EnboxAgent) => {
    // Register all DIDs as tenants on remote DWN endpoints.
    // The SDK's vaultConnect() handles this when registration options are
    // provided, but restoreSession() does not re-register tenants.
    try {
      await ensureRegistration(agent, DEFAULT_DWN_ENDPOINTS);
    } catch (err) {
      console.warn('EnboxAuthProvider: DWN tenant registration failed:', err);
    }
  }, []);

  // ── Auto-restore from cached session PIN ─────────────────────────

  const tryAutoRestore = useCallback(async (auth: AuthManager): Promise<boolean> => {
    const cachedPin = getCachedSessionPin();
    if (!cachedPin) return false;
    if (auth.state !== 'locked') return false;

    try {
      const session = await auth.restoreSession({ password: cachedPin });
      if (!session) {
        clearSessionPin();
        return false;
      }
      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      ensurePostSession(agent);
      return true;
    } catch {
      clearSessionPin();
      return false;
    }
  }, [setUnlocked, ensurePostSession]);

  // ── Phase 1: Create AuthManager on mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const hasFragment = globalThis.location?.hash?.length > 1;
      const cachedEndpoint = localStorage.getItem(STORAGE_KEYS.LOCAL_DWN_ENDPOINT);

      // Only attempt local DWN discovery on desktop. On mobile/touch
      // devices there's no local DWN, and the dwn:// URL open triggers
      // a blocked popup warning in mobile browsers.
      const isTouchDevice = 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
      if (!hasFragment && !cachedEndpoint && !isTouchDevice) {
        requestLocalDwnDiscovery();
        await new Promise<void>((resolve) => setTimeout(resolve, DWN_DISCOVERY_TIMEOUT_MS));
        if (cancelled) return;
      }

      const auth = await AuthManager.create({
        dwnEndpoints: DEFAULT_DWN_ENDPOINTS,
        registration: {
          onSuccess: () => {},
          onFailure: (err: unknown) => console.warn('EnboxAuthProvider: DWN registration failed:', err),
          onProviderAuthRequired: async ({ authorizeUrl, state }: { authorizeUrl: string; state: string }) => {
            const res = await fetch(authorizeUrl, { signal: AbortSignal.timeout(30_000) });
            if (!res.ok) {
              throw new Error(`Provider auth failed (${res.status}): ${await res.text()}`);
            }
            const { code, state: returnedState } = (await res.json()) as { code: string; state: string };
            if (returnedState !== state) {
              throw new Error('Provider auth state mismatch — possible CSRF');
            }
            return { code, state: returnedState };
          },
          registrationTokens: getStoredTokens(),
          onRegistrationTokens: storeTokens,
        },
      });

      if (cancelled) return;
      authManagerRef.current = auth;

      const autoRestored = await tryAutoRestore(auth);
      if (cancelled) return;

      if (!autoRestored) {
        const firstTime = auth.state === 'uninitialized';
        setInitialized(true, firstTime);
      } else {
        setInitialized(true, false);
      }
    }

    init().catch((err) => {
      console.error('EnboxAuthProvider: Initialization failed:', err);
    });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect (first-time setup) ───────────────────────────────────

  const connect = useCallback(async (password: string, dwnEndpoints?: string[]): Promise<string | undefined> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    setIsLoading(true);
    setError(null);
    try {
      // vaultConnect: initializes vault, creates agent DID, registers
      // agent DID for sync, starts sync. We don't pass createIdentity
      // because the wallet handles identity creation in its own UI.
      const session = await auth.connect({
        password,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
      });

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      ensurePostSession(agent);

      return session.recoveryPhrase;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession]);

  // ── Unlock (returning user) ──────────────────────────────────────

  const unlock = useCallback(async (password: string): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    setIsLoading(true);
    setError(null);
    try {
      const session = await auth.restoreSession({ password });
      if (!session) throw new Error('Failed to restore session');

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      ensurePostSession(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unlock failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession]);

  // ── Restore (from recovery phrase) ───────────────────────────────

  const restore = useCallback(async (
    recoveryPhrase: string,
    password: string,
    dwnEndpoints?: string[],
    options?: RestoreOptions,
  ): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    setIsLoading(true);
    setError(null);
    try {
      if (options?.resetLocalVault) {
        await resetLocalVaultForPhraseRestore(auth);
      }

      // connectVault bypasses the generic connect() session-restore probe.
      // For phrase recovery, we always want the explicit vault path so a
      // stale previous-session marker cannot intercept the recovery attempt.
      const session = await auth.connectVault({
        password,
        recoveryPhrase,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
      });

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      ensurePostSession(agent);
    } catch (err) {
      if (options?.resetLocalVault) {
        setInitialized(true, true);
      }
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setInitialized, setUnlocked, ensurePostSession]);

  // ── Lock ─────────────────────────────────────────────────────────

  const lock = useCallback(() => {
    clearSessionPin();
    const auth = authManagerRef.current;
    if (auth) {
      auth.lock().catch((err: unknown) => {
        console.warn('EnboxAuthProvider: Lock failed:', err);
      });
    }
    storeLock();
  }, [storeLock]);

  // ── Inactivity auto-lock ─────────────────────────────────────────

  useEffect(() => {
    if (!unlocked) return;

    const timeoutMs = getAutoLockTimeout();
    if (timeoutMs === 0) return; // "Never" option

    let timer: ReturnType<typeof setTimeout> = setTimeout(lock, timeoutMs);

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, timeoutMs);
    };

    window.addEventListener('mousemove', reset);
    window.addEventListener('keypress', reset);
    window.addEventListener('touchstart', reset);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keypress', reset);
      window.removeEventListener('touchstart', reset);
    };
  }, [unlocked, lock]);

  // ── Render ───────────────────────────────────────────────────────

  const value: EnboxAuthContextValue = { connect, unlock, restore, lock, error, isLoading };

  return (
    <EnboxAuthContext.Provider value={value}>
      {children}
    </EnboxAuthContext.Provider>
  );
};
