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
import type { EnboxAgent } from './types';
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

async function getAgentDwnEndpoints(agent: EnboxAgent): Promise<string[]> {
  // Auth refreshes the agent DID before returning a restored session. Read the
  // advertised endpoints through the agent resolver so that a portable vault's
  // older BearerDid snapshot cannot replace that authoritative result in the
  // wallet's endpoint cache. This is an ordinary cache hit, not another forced
  // network resolution.
  return agent.identity.getDwnEndpoints({ didUri: agent.agentDid.uri });
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
    await runEnboxPromise(lockAuthManagerEffect(auth)).catch(() => {});
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
    dwnEndpoints?: string[],
  ) => Promise<void>;
  lock: () => void;
  adoptDwnEndpoints: (endpoints: string[]) => void;
  dwnEndpoints: string[];
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
  const authenticationAttemptRef = useRef(false);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  // ── Auto-restore from cached session vault password ──────────────

  const tryAutoRestore = useCallback(async (auth: WalletAuthManager): Promise<boolean> => {
    const cachedPassword = getCachedSessionPassword();
    if (!cachedPassword) return false;
    if (auth.state !== 'locked') return false;
    if (authenticationAttemptRef.current) return false;

    authenticationAttemptRef.current = true;
    try {
      const session = await runEnboxPromise(restoreSessionEffect(auth, cachedPassword));
      if (!session) {
        await lockFailedAuthSession(auth, storeLock);
        return false;
      }
      await finishAuthentication(auth, session.agent, cachedPassword);
      return true;
    } catch {
      if (authManagerRef.current === auth) {
        await lockFailedAuthSession(auth, storeLock);
      }
      return false;
    } finally {
      authenticationAttemptRef.current = false;
    }
  }, [finishAuthentication, storeLock]);

  // ── Phase 1: Create AuthManager on mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;
    let ownedAuth: WalletAuthManager | null = null;

    async function init() {
      const auth = await runEnboxPromise(createWalletAuthManagerEffect());
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
    }

    init().catch((err) => {
      console.error('EnboxAuthProvider: Initialization failed:', err);
    });

    return () => {
      cancelled = true;
      if (ownedAuth !== null) {
        if (authManagerRef.current === ownedAuth) {
          authManagerRef.current = null;
          storeLock();
          setInitialized(false, false);
        }
        void shutdownOwnedAuthManager(ownedAuth);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const session = await runEnboxPromise(restoreSessionEffect(auth, password));
      if (!session) throw new Error('Failed to restore session');

      await finishAuthentication(auth, session.agent, password);
    });
  }, [finishAuthentication, runAuthentication]);

  // ── Restore (from recovery phrase) ───────────────────────────────

  const restore = useCallback(async (
    recoveryPhrase: string,
    password: string,
    dwnEndpoints?: string[],
  ): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    return runAuthentication(auth, 'Restore failed', async () => {
      const session = await runEnboxPromise(
        restoreFromPhraseEffect(auth, recoveryPhrase, password, dwnEndpoints),
      );

      await finishAuthentication(auth, session.agent, password);
    });
  }, [finishAuthentication, runAuthentication]);

  // ── Lock ─────────────────────────────────────────────────────────

  const lock = useCallback(() => {
    clearSessionPassword();
    const auth = authManagerRef.current;
    if (auth) {
      runEnboxPromise(lockAuthManagerEffect(auth)).catch((err: unknown) => {
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

  const value: EnboxAuthContextValue = {
    connect,
    unlock,
    restore,
    lock,
    adoptDwnEndpoints: applyAuthoritativeDwnEndpoints,
    dwnEndpoints,
    error,
    isLoading,
  };

  return (
    <EnboxAuthContext.Provider value={value}>
      {children}
    </EnboxAuthContext.Provider>
  );
};
