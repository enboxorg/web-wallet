/**
 * EnboxAuthProvider — core authentication provider for the wallet.
 *
 * DESIGN PRINCIPLE: Let the SDK manage sync. The SDK's AuthManager handles
 * sync start/stop, WebSocket push/pull, agent DID sync (for seed phrase
 * recovery), and identity recovery from remote DWNs automatically. We only
 * intervene for:
 * - Post-session DWN tenant registration (restoreSession does not
 *   re-register tenants, so we do it on every unlock)
 * - Wallet-scoped identity DID sync registration when identities are
 *   created/imported
 * - Inactivity auto-lock timer
 * - Session PIN caching for same-tab refresh persistence
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AuthManager, requestLocalDwnDiscovery } from '@enbox/auth';

import { useAuthStore } from '@/stores/auth-store';
import { getAutoLockTimeout, SESSION_PIN_KEY, STORAGE_KEYS } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { IDENTITY_SYNC_PROTOCOLS } from './protocols';
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

// ── Context ────────────────────────────────────────────────────────

export interface EnboxAuthContextValue {
  connect: (password: string, dwnEndpoints?: string[]) => Promise<string | undefined>;
  unlock: (password: string) => Promise<void>;
  restore: (
    recoveryPhrase: string,
    password: string,
    dwnEndpoints?: string[],
  ) => Promise<void>;
  lock: () => void;
  error: string | null;
  isLoading: boolean;
}

const EnboxAuthContext = createContext<EnboxAuthContextValue | null>(null);

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
    // The SDK's connectVault() handles this when registration options are
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
        identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
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
      // connectVault initializes the vault, creates/registers the agent DID,
      // and starts sync. We intentionally skip createIdentity because the
      // wallet handles identity creation in its own UI.
      const session = await auth.connectVault({
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
  ): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    setIsLoading(true);
    setError(null);
    try {
      const session = await auth.restoreFromPhrase({
        password,
        recoveryPhrase,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
      });

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      ensurePostSession(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession]);

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
