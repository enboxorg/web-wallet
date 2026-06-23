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
 * - Session vault password caching for same-tab refresh persistence
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Effect } from 'effect';

import { useAuthStore } from '@/stores/auth-store';
import {
  getAutoLockTimeout,
  SESSION_PIN_KEY,
  SESSION_VAULT_PASSWORD_KEY,
  STORAGE_KEYS,
} from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import {
  localStorageGetEffect,
  sessionStorageGetEffect,
  sessionStorageRemoveEffect,
  sessionStorageSetEffect,
} from '@/lib/browser-effects';
import { ensureRegistration } from './registration';
import type { EnboxAgent } from './types';
import {
  connectVaultEffect,
  createWalletAuthManagerEffect,
  lockAuthManagerEffect,
  requestLocalDwnDiscoveryUntilEndpointEffect,
  restoreFromPhraseEffect,
  restoreSessionEffect,
  type WalletAuthManager,
} from './auth-effects';
import { runEnboxPromise, runEnboxSync } from './effect/runtime';
import { withWalletOperationLock } from './effect/keyed-mutex';
import { publishWalletEvent } from './effect/wallet-events';

// ── Local DWN discovery ────────────────────────────────────────────

const DWN_DISCOVERY_TIMEOUT_MS = 3_000;
const AUTH_OPERATION_LOCK_KEY = 'auth:vault';

// ── Session vault password helpers ─────────────────────────────────

function cacheSessionPassword(password: string): void {
  runEnboxSync(sessionStorageSetEffect(SESSION_VAULT_PASSWORD_KEY, password));
  runEnboxSync(sessionStorageRemoveEffect(SESSION_PIN_KEY));
}

function getCachedSessionPassword(): string | null {
  return runEnboxSync(sessionStorageGetEffect(SESSION_VAULT_PASSWORD_KEY))
    ?? runEnboxSync(sessionStorageGetEffect(SESSION_PIN_KEY));
}

function clearSessionPassword(): void {
  runEnboxSync(sessionStorageRemoveEffect(SESSION_VAULT_PASSWORD_KEY));
  runEnboxSync(sessionStorageRemoveEffect(SESSION_PIN_KEY));
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
  const authManagerRef = useRef<WalletAuthManager | null>(null);
  const activeAuthOperationRef = useRef<Promise<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setInitialized, setUnlocked, lock: storeLock } = useAuthStore();
  const unlocked = useAuthStore((s) => s.unlocked);

  const runLockedAuthOperation = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const current = activeAuthOperationRef.current;
    if (current) {
      return current as Promise<T>;
    }

    const promise = runEnboxPromise(
      withWalletOperationLock(
        AUTH_OPERATION_LOCK_KEY,
        Effect.tryPromise({
          try: operation,
          catch: (err) => err,
        }),
      ),
    ).finally(() => {
      if (activeAuthOperationRef.current === promise) {
        activeAuthOperationRef.current = null;
      }
    });

    activeAuthOperationRef.current = promise;
    return promise;
  }, []);

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

  // ── Auto-restore from cached session vault password ──────────────

  const tryAutoRestore = useCallback(async (auth: WalletAuthManager): Promise<boolean> => {
    const cachedPassword = getCachedSessionPassword();
    if (!cachedPassword) return false;
    if (auth.state !== 'locked') return false;

    try {
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(restoreSessionEffect(auth, cachedPassword))
      );
      if (!session) {
        clearSessionPassword();
        return false;
      }
      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      })).catch((err: unknown) => {
        console.warn('EnboxAuthProvider: Failed to publish auto-restore event:', err);
      });
      ensurePostSession(agent);
      return true;
    } catch {
      clearSessionPassword();
      return false;
    }
  }, [setUnlocked, ensurePostSession, runLockedAuthOperation]);

  // ── Phase 1: Create AuthManager on mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const hasFragment = globalThis.location?.hash?.length > 1;
      const cachedEndpoint = runEnboxSync(localStorageGetEffect(STORAGE_KEYS.LOCAL_DWN_ENDPOINT));

      // Only attempt local DWN discovery on desktop for fresh sessions.
      // Returning users already have a same-tab vault password cached, so
      // discovery would only delay restore.
      const isTouchDevice = 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
      const hasCachedSession = !!getCachedSessionPassword();
      if (!hasFragment && !cachedEndpoint && !isTouchDevice && !hasCachedSession) {
        await runEnboxPromise(
          requestLocalDwnDiscoveryUntilEndpointEffect(DWN_DISCOVERY_TIMEOUT_MS),
        );
        if (cancelled) return;
      }

      const auth = await runEnboxPromise(createWalletAuthManagerEffect());

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
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(connectVaultEffect(auth, password, dwnEndpoints)),
      );

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      await runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      }));
      cacheSessionPassword(password);
      ensurePostSession(agent);

      return session.recoveryPhrase;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession, runLockedAuthOperation]);

  // ── Unlock (returning user) ──────────────────────────────────────

  const unlock = useCallback(async (password: string): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    setIsLoading(true);
    setError(null);
    try {
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(restoreSessionEffect(auth, password)),
      );
      if (!session) throw new Error('Failed to restore session');

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      await runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      }));
      cacheSessionPassword(password);
      ensurePostSession(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unlock failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession, runLockedAuthOperation]);

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
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(restoreFromPhraseEffect(auth, recoveryPhrase, password, dwnEndpoints)),
      );

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      await runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      }));
      cacheSessionPassword(password);
      ensurePostSession(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession, runLockedAuthOperation]);

  // ── Lock ─────────────────────────────────────────────────────────

  const lock = useCallback(() => {
    clearSessionPassword();
    const auth = authManagerRef.current;
    if (auth) {
      runEnboxPromise(
        withWalletOperationLock(
          AUTH_OPERATION_LOCK_KEY,
          lockAuthManagerEffect(auth),
        ),
      ).catch((err: unknown) => {
        console.warn('EnboxAuthProvider: Lock failed:', err);
      });
    }
    runEnboxPromise(publishWalletEvent({ _tag: 'identity.disconnected' })).catch((err: unknown) => {
      console.warn('EnboxAuthProvider: Failed to publish lock event:', err);
    });
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
