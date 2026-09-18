/**
 * EnboxAuthProvider — core authentication provider for the wallet.
 *
 * DESIGN PRINCIPLE: Let the SDK manage sync. The SDK's AuthManager handles
 * sync start/stop, WebSocket push/pull, agent DID sync (for seed phrase
 * recovery), and identity recovery from remote DWNs automatically. We only
 * intervene for:
 * - Wallet-scoped identity DID sync registration when identities are
 *   created/imported
 * - DWN tenant registration when a DID is created or gains a new endpoint
 * - Inactivity auto-lock timer
 * - Session vault password caching for same-tab refresh persistence
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store';
import {
  getAutoLockTimeout,
  SESSION_VAULT_PASSWORD_KEY,
} from '@/lib/constants';
import {
  getConfiguredDwnEndpoints,
  normalizeDwnEndpoints,
  setConfiguredDwnEndpoints,
} from '@/lib/dwn-endpoints';
import {
  sessionStorageGetEffect,
  sessionStorageRemoveEffect,
  sessionStorageSetEffect,
} from '@/lib/browser-effects';
import { withPromiseTimeout } from '@/lib/promise-timeout';
import type { EnboxAgent, WalletRestoreOptions } from './types';
import {
  connectVaultEffect,
  createWalletAuthManagerEffect,
  lockAuthManagerEffect,
  restoreFromPhraseEffect,
  restoreSessionEffect,
  type WalletAuthManager,
} from './auth-effects';
import { runEnboxPromise, runEnboxSync } from './effect/runtime';
import { queryKeys } from './queries/query-keys';

const AUTH_FINALIZATION_TIMEOUT_MS = 10_000;

async function getAgentDwnEndpoints(agent: EnboxAgent): Promise<string[]> {
  // Auth refreshes the agent DID before returning a restored session. Read the
  // advertised endpoints through the agent resolver so that a portable vault's
  // older BearerDid snapshot cannot replace that authoritative result in the
  // wallet's endpoint cache. This should be an ordinary cache hit, but it is
  // still a promise-only SDK boundary, so fail closed if it never settles.
  return withPromiseTimeout(
    () => agent.identity.getDwnEndpoints({ didUri: agent.agentDid.uri }),
    AUTH_FINALIZATION_TIMEOUT_MS,
    () => new Error(
      'Wallet initialization timed out while loading network settings. Try again.',
    ),
  );
}

// ── Session vault password helpers ─────────────────────────────────

function cacheSessionPassword(password: string): void {
  runEnboxSync(sessionStorageSetEffect(SESSION_VAULT_PASSWORD_KEY, password));
}

function getCachedSessionPassword(): string | null {
  return runEnboxSync(sessionStorageGetEffect(SESSION_VAULT_PASSWORD_KEY));
}

function clearSessionPassword(): void {
  runEnboxSync(sessionStorageRemoveEffect(SESSION_VAULT_PASSWORD_KEY));
}

function shutdownOwnedAuthManager(auth: WalletAuthManager): Promise<void> {
  return auth.shutdown().catch((err: unknown) => {
    console.warn('EnboxAuthProvider: Shutdown failed:', err);
  });
}

async function lockFailedAuthSession(auth: WalletAuthManager, storeLock: () => void): Promise<void> {
  if (!auth.isLocked) {
    await runEnboxPromise(lockAuthManagerEffect(auth)).catch((err: unknown) => {
      console.warn('EnboxAuthProvider: Failed to roll back auth session:', err);
    });
  }
  clearSessionPassword();
  storeLock();
}

// ── Context ────────────────────────────────────────────────────────

export interface EnboxAuthContextValue {
  connect: (password: string, dwnEndpoints: string[]) => Promise<string | undefined>;
  unlock: (password: string) => Promise<void>;
  restore: (
    recoveryPhrase: string,
    password: string,
    options?: WalletRestoreOptions,
  ) => Promise<void>;
  retryInitialization: () => void;
  lock: () => void;
  adoptDwnEndpoints: (endpoints: string[]) => void;
  dwnEndpoints: string[];
  error: string | null;
  isLoading: boolean;
  isLocking: boolean;
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
  const authenticationAttemptRef = useRef(false);
  const initializationRetryReadyRef = useRef(false);
  const lockCompletionRef = useRef<Promise<void> | null>(null);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [isLocking, setIsLocking] = useState(false);
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>(getConfiguredDwnEndpoints);

  const { setInitialized, setUnlocked, lock: storeLock } = useAuthStore();
  const unlocked = useAuthStore((state) => state.agent !== null);

  const applyAuthoritativeDwnEndpoints = useCallback((endpoints: string[]): void => {
    const normalized = normalizeDwnEndpoints(endpoints);
    setDwnEndpoints(normalized);
    setConfiguredDwnEndpoints(normalized);
  }, []);

  const finishAuthentication = useCallback(async (
    auth: WalletAuthManager,
    agent: EnboxAgent,
    password: string,
  ): Promise<void> => {
    const endpoints = await getAgentDwnEndpoints(agent);
    if (authManagerRef.current !== auth) {
      throw new Error('Authentication session ended before wallet initialization completed.');
    }
    applyAuthoritativeDwnEndpoints(endpoints);
    cacheSessionPassword(password);
    setUnlocked(agent);
    void queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
  }, [setUnlocked, applyAuthoritativeDwnEndpoints, queryClient]);

  const runAuthentication = useCallback(async <T,>(
    auth: WalletAuthManager,
    failureMessage: string,
    operation: () => Promise<T>,
  ): Promise<T> => {
    if (authenticationAttemptRef.current) {
      throw new Error('Authentication is already in progress.');
    }

    authenticationAttemptRef.current = true;
    setIsLoading(true);
    setError(null);
    try {
      // The locked UI is exposed immediately for privacy, while SDK teardown
      // finishes asynchronously. Never let a new authentication overtake it.
      const pendingLock = lockCompletionRef.current;
      if (pendingLock !== null) await pendingLock;
      if (authManagerRef.current !== auth) {
        throw new Error('Authentication session ended before wallet initialization completed.');
      }
      return await operation();
    } catch (err) {
      if (authManagerRef.current !== auth) {
        throw err;
      }
      await lockFailedAuthSession(auth, storeLock);
      setError(err instanceof Error ? err.message : failureMessage);
      throw err;
    } finally {
      authenticationAttemptRef.current = false;
      if (authManagerRef.current === auth) {
        setIsLoading(false);
      }
    }
  }, [storeLock]);

  const restoreStoredSession = useCallback(async (
    auth: WalletAuthManager,
    password: string,
  ): Promise<boolean> => {
    const session = await runEnboxPromise(restoreSessionEffect(auth, password));
    if (!session) return false;

    await finishAuthentication(auth, session.agent, password);
    return true;
  }, [finishAuthentication]);

  // ── Auto-restore from cached session vault password ──────────────

  const tryAutoRestore = useCallback(async (auth: WalletAuthManager): Promise<boolean> => {
    const cachedPassword = getCachedSessionPassword();
    if (!cachedPassword) return false;
    if (auth.state !== 'locked') return false;
    if (authenticationAttemptRef.current) return false;

    authenticationAttemptRef.current = true;
    try {
      const restored = await restoreStoredSession(auth, cachedPassword);
      if (!restored) {
        await lockFailedAuthSession(auth, storeLock);
        return false;
      }
      return true;
    } catch {
      if (authManagerRef.current === auth) {
        await lockFailedAuthSession(auth, storeLock);
      }
      return false;
    } finally {
      authenticationAttemptRef.current = false;
    }
  }, [restoreStoredSession, storeLock]);

  const retryInitialization = useCallback(() => {
    if (!initializationRetryReadyRef.current) return;
    initializationRetryReadyRef.current = false;
    setError(null);
    setInitializationAttempt((attempt) => attempt + 1);
  }, []);

  // ── Phase 1: Create AuthManager on mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;
    let ownedAuth: WalletAuthManager | null = null;
    initializationRetryReadyRef.current = false;

    async function init() {
      let auth: WalletAuthManager;
      try {
        auth = await runEnboxPromise(createWalletAuthManagerEffect());
      } catch (err) {
        if (cancelled) return;

        console.error('EnboxAuthProvider: Initialization failed:', err);
        storeLock();
        setInitialized(false, false);
        initializationRetryReadyRef.current = true;
        setError(err instanceof Error && err.message
          ? err.message
          : 'Wallet initialization failed. Try again.');
        return;
      }

      ownedAuth = auth;
      if (cancelled) {
        await shutdownOwnedAuthManager(auth);
        return;
      }
      authManagerRef.current = auth;

      const autoRestored = await tryAutoRestore(auth);
      if (cancelled) return;

      if (!autoRestored) {
        const firstTime = auth.state === 'uninitialized';
        setInitialized(true, firstTime);
      } else {
        setInitialized(true, false);
      }
      setError(null);
    }

    void init();

    return () => {
      cancelled = true;
      initializationRetryReadyRef.current = false;
      if (ownedAuth !== null) {
        if (authManagerRef.current === ownedAuth) {
          authManagerRef.current = null;
          storeLock();
          setInitialized(false, false);
        }
        void shutdownOwnedAuthManager(ownedAuth);
      }
    };
  }, [initializationAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Connect (first-time setup) ───────────────────────────────────

  const connect = useCallback(async (password: string, dwnEndpoints: string[]): Promise<string | undefined> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    return runAuthentication(auth, 'Connection failed', async () => {
      // connectVault initializes the vault, creates/registers the agent DID,
      // and starts sync. We intentionally skip createIdentity because the
      // wallet handles identity creation in its own UI.
      const session = await runEnboxPromise(connectVaultEffect(auth, password, dwnEndpoints));

      await finishAuthentication(auth, session.agent, password);

      return session.recoveryPhrase;
    });
  }, [finishAuthentication, runAuthentication]);

  // ── Unlock (returning user) ──────────────────────────────────────

  const unlock = useCallback(async (password: string): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    return runAuthentication(auth, 'Unlock failed', async () => {
      if (!await restoreStoredSession(auth, password)) {
        throw new Error('Failed to restore session');
      }
    });
  }, [restoreStoredSession, runAuthentication]);

  // ── Restore (from recovery phrase) ───────────────────────────────

  const restore = useCallback(async (
    recoveryPhrase: string,
    password: string,
    options?: WalletRestoreOptions,
  ): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    return runAuthentication(auth, 'Restore failed', async () => {
      const session = await runEnboxPromise(
        restoreFromPhraseEffect(auth, recoveryPhrase, password, options),
      );

      await finishAuthentication(auth, session.agent, password);
    });
  }, [finishAuthentication, runAuthentication]);

  // ── Lock ─────────────────────────────────────────────────────────

  const lock = useCallback(() => {
    clearSessionPassword();
    const auth = authManagerRef.current;
    if (!auth || lockCompletionRef.current !== null) {
      storeLock();
      return;
    }

    // Hide wallet data synchronously, but keep the unlock UI disabled until
    // the SDK has stopped sync, cleared its session, and locked the vault.
    setIsLocking(true);
    storeLock();

    const completion = runEnboxPromise(lockAuthManagerEffect(auth))
      .catch((err: unknown) => {
        console.warn('EnboxAuthProvider: Lock failed:', err);
      })
      .finally(() => {
        if (lockCompletionRef.current === completion) {
          lockCompletionRef.current = null;
        }
        if (authManagerRef.current === auth) {
          setIsLocking(false);
        }
      });
    lockCompletionRef.current = completion;
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

  const value: EnboxAuthContextValue = {
    connect,
    unlock,
    restore,
    retryInitialization,
    lock,
    adoptDwnEndpoints: applyAuthoritativeDwnEndpoints,
    dwnEndpoints,
    error,
    isLoading,
    isLocking,
  };

  return (
    <EnboxAuthContext.Provider value={value}>
      {children}
    </EnboxAuthContext.Provider>
  );
};
