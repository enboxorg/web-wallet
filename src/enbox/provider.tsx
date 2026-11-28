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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getDwnEndpointStatus } from '@enbox/dids';
import { useAuthStore } from '@/stores/auth-store';
import { IncorrectPinError } from '@/lib/auth-errors';
import {
  AUTO_LOCK_CHANGED_EVENT,
  AUTO_LOCK_STORAGE_KEY,
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
const AUTH_SHUTDOWN_WAIT_TIMEOUT_MS = 3_000;
const ACTIVITY_RESET_THROTTLE_MS = 1_000;

const pendingAuthManagerShutdowns = new Set<Promise<void>>();

type RetainedDidResolution = {
  didDocument?: Parameters<typeof getDwnEndpointStatus>[1] | null;
  didResolutionMetadata?: { error?: string };
};

type RetainedDidCache = {
  getRetained?: (didUri: string) => Promise<RetainedDidResolution | undefined>;
};

type RetainedIdentityApi = {
  getRetainedDwnEndpointStatus?: (params: { didUri: string }) => Promise<ReturnType<typeof getDwnEndpointStatus> | undefined>;
};

type RetainedDidApi = {
  getRetainedResolution?: (didUri: string) => Promise<RetainedDidResolution | undefined>;
  cache?: RetainedDidCache;
};

async function readRetainedAgentDwnEndpoints(
  agent: EnboxAgent,
  signal: AbortSignal,
): Promise<string[] | undefined> {
  const didUri = agent.agentDid.uri;
  const timeoutError = () => new Error('Timed out reading retained agent DID settings.');

  try {
    // Prefer the public retained-resolution APIs (@enbox/agent >= PR #1876).
    const identityApi = agent.identity as unknown as RetainedIdentityApi | undefined;
    if (typeof identityApi?.getRetainedDwnEndpointStatus === 'function') {
      const status = await withPromiseTimeout(
        () => identityApi.getRetainedDwnEndpointStatus!({ didUri }),
        AUTH_FINALIZATION_TIMEOUT_MS,
        timeoutError,
        signal,
      );
      return status?.status === 'ready' ? normalizeDwnEndpoints(status.endpoints) : undefined;
    }

    const didApi = agent.did as unknown as RetainedDidApi | undefined;
    const readRetained = typeof didApi?.getRetainedResolution === 'function'
      ? () => didApi.getRetainedResolution!(didUri)
      : typeof didApi?.cache?.getRetained === 'function'
        ? () => didApi.cache!.getRetained!(didUri)
        : undefined;
    if (readRetained === undefined) {
      return undefined;
    }

    const retained = await withPromiseTimeout(
      readRetained,
      AUTH_FINALIZATION_TIMEOUT_MS,
      timeoutError,
      signal,
    );
    if (!retained?.didDocument || retained.didResolutionMetadata?.error !== undefined) {
      return undefined;
    }
    const status = getDwnEndpointStatus(didUri, retained.didDocument);
    return status.status === 'ready' ? normalizeDwnEndpoints(status.endpoints) : undefined;
  } catch (err: unknown) {
    if (!signal.aborted) {
      console.warn('EnboxAuthProvider: Failed to read retained agent DWN endpoints:', err);
    }
    return undefined;
  }
}

async function getAgentDwnEndpoints(agent: EnboxAgent, signal: AbortSignal): Promise<string[]> {
  // Read the advertised endpoints through the agent resolver so that a portable
  // vault's older BearerDid snapshot cannot replace that authoritative result
  // in the wallet's endpoint cache. Fail closed if the SDK call never settles.
  return withPromiseTimeout(
    () => agent.identity.getDwnEndpoints({ didUri: agent.agentDid.uri }),
    AUTH_FINALIZATION_TIMEOUT_MS,
    () => new Error(
      'Wallet initialization timed out while loading network settings. Try again.',
    ),
    signal,
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
  const shutdown = auth.shutdown().catch((err: unknown) => {
    console.warn('EnboxAuthProvider: Shutdown failed:', err);
  });
  const tracked = shutdown.finally(() => {
    pendingAuthManagerShutdowns.delete(tracked);
  });
  pendingAuthManagerShutdowns.add(tracked);
  return tracked;
}

async function waitForPendingAuthManagerShutdown(): Promise<void> {
  if (pendingAuthManagerShutdowns.size === 0) return;
  const snapshot = [...pendingAuthManagerShutdowns];
  await withPromiseTimeout(
    () => Promise.allSettled(snapshot).then(() => undefined),
    AUTH_SHUTDOWN_WAIT_TIMEOUT_MS,
    () => new Error('Previous wallet shutdown timed out.'),
  ).catch((err: unknown) => {
    console.warn('EnboxAuthProvider: Continuing initialization after slow shutdown:', err);
  });
}

async function lockFailedAuthSession(auth: WalletAuthManager): Promise<void> {
  // Also call lock() when an in-flight connection attempt (e.g. a stalled
  // restoreSession) timed out before flipping `isLocked` — lock() invalidates
  // the SDK's connection attempt so retries succeed and late resolution cannot
  // unlock the vault behind the Lock Screen.
  if (!auth.isLocked || (auth.isConnecting && auth.state !== 'uninitialized')) {
    await runEnboxPromise(lockAuthManagerEffect(auth)).catch((err: unknown) => {
      console.warn('EnboxAuthProvider: Failed to roll back auth session:', err);
    });
  }
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
  /** Change the PIN of a PIN-secured wallet while it is unlocked. */
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  /** Whether `pin` is this unlocked wallet's PIN; null when it can't be checked. */
  verifyPin: (pin: string) => boolean | null;
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
  // One cancellation scope spans SDK calls and the wallet's final cache/store commit.
  const authenticationControllerRef = useRef<AbortController | null>(null);
  const initializationRetryReadyRef = useRef(false);
  const lockCompletionRef = useRef<Promise<void> | null>(null);
  const endpointsRevisionRef = useRef(0);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [initializationAttempt, setInitializationAttempt] = useState(0);
  const [isLocking, setIsLocking] = useState(false);
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>(getConfiguredDwnEndpoints);

  const { setInitialized, setUnlocked, lock: storeLock } = useAuthStore();
  const unlocked = useAuthStore((state) => state.agent !== null);

  const applyAuthoritativeDwnEndpoints = useCallback((endpoints: string[]): void => {
    endpointsRevisionRef.current += 1;
    const normalized = normalizeDwnEndpoints(endpoints);
    setDwnEndpoints((prev) => (
      prev.length === normalized.length && prev.every((url, index) => url === normalized[index])
        ? prev
        : normalized
    ));
    setConfiguredDwnEndpoints(normalized);
  }, []);

  const finishAuthentication = useCallback(async (
    auth: WalletAuthManager,
    agent: EnboxAgent,
    password: string,
    signal: AbortSignal,
    options: { preferRetainedEndpoints?: boolean } = {},
  ): Promise<void> => {
    signal.throwIfAborted();
    // On returning-user unlock, DidResolverCacheLevel's 15-minute TTL may have
    // expired while the signed resolution is still retained locally in IndexedDB.
    // Calling agent.identity.getDwnEndpoints() synchronously would block unlock
    // on a 30s network DHT lookup (and fail unlock at 10s if the gateway stalls).
    // Adopt the locally retained signed endpoints immediately and refresh the
    // resolver cache in the background without blocking unlock.
    const retainedEndpoints = options.preferRetainedEndpoints
      ? await readRetainedAgentDwnEndpoints(agent, signal)
      : undefined;
    signal.throwIfAborted();
    const endpoints = retainedEndpoints ?? await getAgentDwnEndpoints(agent, signal);
    signal.throwIfAborted();
    if (authManagerRef.current !== auth) {
      throw new Error('Authentication session ended before wallet initialization completed.');
    }
    applyAuthoritativeDwnEndpoints(endpoints);
    const revisionAtUnlock = endpointsRevisionRef.current;
    cacheSessionPassword(password);
    setUnlocked(agent);
    void queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });

    if (retainedEndpoints !== undefined) {
      void agent.identity.getDwnEndpoints({ didUri: agent.agentDid.uri })
        .then((refreshed) => {
          if (
            signal.aborted
            || authManagerRef.current !== auth
            || useAuthStore.getState().agent !== agent
            || endpointsRevisionRef.current !== revisionAtUnlock
          ) {
            return;
          }
          applyAuthoritativeDwnEndpoints(refreshed);
        })
        .catch((err: unknown) => {
          console.warn('EnboxAuthProvider: Background agent DWN endpoint refresh failed:', err);
        });
    }
  }, [setUnlocked, applyAuthoritativeDwnEndpoints, queryClient]);

  const rollbackAuthentication = useCallback(async (
    auth: WalletAuthManager,
    controller: AbortController,
  ): Promise<void> => {
    const ownsAttempt = () => authManagerRef.current === auth
      && authenticationControllerRef.current === controller;
    if (!ownsAttempt()) return;
    const pendingLock = lockCompletionRef.current;
    if (pendingLock !== null) await pendingLock;
    if (!ownsAttempt()) return;
    await lockFailedAuthSession(auth);
    // SDK teardown may outlive this provider. Never clear a replacement's session.
    if (!ownsAttempt()) return;
    clearSessionPassword();
    storeLock();
  }, [storeLock]);

  const runAuthentication = useCallback(async <T,>(
    auth: WalletAuthManager,
    failureMessage: string,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    if (authenticationControllerRef.current !== null) {
      throw new Error('Authentication is already in progress.');
    }

    const controller = new AbortController();
    authenticationControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      // The locked UI is exposed immediately for privacy, while SDK teardown
      // finishes asynchronously. Never let a new authentication overtake it.
      const pendingLock = lockCompletionRef.current;
      if (pendingLock !== null) await pendingLock;
      controller.signal.throwIfAborted();
      if (authManagerRef.current !== auth) {
        throw new Error('Authentication session ended before wallet initialization completed.');
      }
      return await operation(controller.signal);
    } catch (err) {
      if (authManagerRef.current !== auth || authenticationControllerRef.current !== controller) {
        throw err;
      }
      await rollbackAuthentication(auth, controller);
      if (!controller.signal.aborted && authManagerRef.current === auth && authenticationControllerRef.current === controller) {
        setError(err instanceof Error ? err.message : failureMessage);
      }
      throw err;
    } finally {
      if (authenticationControllerRef.current === controller) {
        authenticationControllerRef.current = null;
        if (authManagerRef.current === auth) setIsLoading(false);
      }
    }
  }, [rollbackAuthentication]);

  const restoreStoredSession = useCallback(async (
    auth: WalletAuthManager,
    password: string,
    signal: AbortSignal,
  ): Promise<boolean> => {
    const session = await runEnboxPromise(restoreSessionEffect(auth, password, signal));
    signal.throwIfAborted();
    if (!session) return false;

    await finishAuthentication(auth, session.agent, password, signal, {
      preferRetainedEndpoints: true,
    });
    return true;
  }, [finishAuthentication]);

  // ── Auto-restore from cached session vault password ──────────────

  const tryAutoRestore = useCallback(async (auth: WalletAuthManager): Promise<boolean> => {
    const cachedPassword = getCachedSessionPassword();
    if (!cachedPassword) return false;
    if (auth.state !== 'locked') return false;
    if (authenticationControllerRef.current !== null) return false;

    const controller = new AbortController();
    authenticationControllerRef.current = controller;
    try {
      const restored = await restoreStoredSession(auth, cachedPassword, controller.signal);
      if (!restored) {
        await rollbackAuthentication(auth, controller);
        return false;
      }
      return true;
    } catch {
      await rollbackAuthentication(auth, controller);
      return false;
    } finally {
      if (authenticationControllerRef.current === controller) {
        authenticationControllerRef.current = null;
      }
    }
  }, [restoreStoredSession, rollbackAuthentication]);

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
      await waitForPendingAuthManagerShutdown();
      if (cancelled) return;

      let auth: WalletAuthManager;
      try {
        auth = await runEnboxPromise(createWalletAuthManagerEffect(shutdownOwnedAuthManager));
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

      setInitialized(true, !autoRestored && auth.state === 'uninitialized');
      setError(null);
    }

    void init();

    return () => {
      cancelled = true;
      initializationRetryReadyRef.current = false;
      if (ownedAuth !== null) {
        if (authManagerRef.current === ownedAuth) {
          authenticationControllerRef.current?.abort();
          authenticationControllerRef.current = null;
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

    return runAuthentication(auth, 'Connection failed', async (signal) => {
      // connectVault initializes the vault, creates/registers the agent DID,
      // and starts sync. We intentionally skip createIdentity because the
      // wallet handles identity creation in its own UI.
      const session = await runEnboxPromise(connectVaultEffect(auth, password, dwnEndpoints));

      await finishAuthentication(auth, session.agent, password, signal);

      return session.recoveryPhrase;
    });
  }, [finishAuthentication, runAuthentication]);

  // ── Unlock (returning user) ──────────────────────────────────────

  const unlock = useCallback(async (password: string): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    return runAuthentication(auth, 'Unlock failed', async (signal) => {
      if (!await restoreStoredSession(auth, password, signal)) {
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

    return runAuthentication(auth, 'Restore failed', async (signal) => {
      const session = await runEnboxPromise(
        restoreFromPhraseEffect(auth, recoveryPhrase, password, options),
      );

      await finishAuthentication(auth, session.agent, password, signal);
    });
  }, [finishAuthentication, runAuthentication]);

  // ── Lock ─────────────────────────────────────────────────────────

  const lock = useCallback(() => {
    authenticationControllerRef.current?.abort();
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

  // ── Change PIN ───────────────────────────────────────────────────

  const verifyPin = useCallback((pin: string): boolean | null => {
    if (useAuthStore.getState().agent === null) return null;
    const sessionPassword = getCachedSessionPassword();
    return sessionPassword === null ? null : sessionPassword === pin;
  }, []);

  const changePin = useCallback(async (currentPin: string, newPin: string): Promise<void> => {
    const agent = useAuthStore.getState().agent;
    if (!agent) throw new Error('Unlock your wallet to change your PIN.');

    // Check the current PIN against this session's vault password before
    // touching the vault: the SDK's changePassword locks the live vault first
    // and leaves it locked when the old password is wrong.
    const sessionPassword = getCachedSessionPassword();
    if (sessionPassword === null) {
      throw new Error('Couldn’t confirm your current PIN. Lock and unlock your wallet, then try again.');
    }
    if (sessionPassword !== currentPin) throw new IncorrectPinError();
    if (newPin === currentPin) throw new Error('Choose a PIN that’s different from your current one.');

    try {
      // Re-wraps the same vault key, so keys and data are untouched.
      await agent.vault.changePassword({ oldPassword: currentPin, newPassword: newPin });
    } catch (err) {
      // Never leave the app running on top of a locked vault.
      if (agent.vault.isLocked()) lock();
      throw err;
    }
    cacheSessionPassword(newPin);
  }, [lock]);

  // ── Inactivity auto-lock ─────────────────────────────────────────

  const [autoLockTimeoutMs, setAutoLockTimeoutMs] = useState(getAutoLockTimeout);

  useEffect(() => {
    const syncAutoLockTimeout = () => {
      setAutoLockTimeoutMs(getAutoLockTimeout());
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === AUTO_LOCK_STORAGE_KEY) {
        syncAutoLockTimeout();
      }
    };

    window.addEventListener(AUTO_LOCK_CHANGED_EVENT, syncAutoLockTimeout);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(AUTO_LOCK_CHANGED_EVENT, syncAutoLockTimeout);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!unlocked || autoLockTimeoutMs === 0) return;

    let lastResetAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;

    const scheduleLock = () => {
      timer = setTimeout(() => {
        if (authenticationControllerRef.current !== null) {
          scheduleLock();
          return;
        }
        lock();
      }, autoLockTimeoutMs);
    };

    scheduleLock();

    const reset = () => {
      const now = Date.now();
      if (now - lastResetAt < ACTIVITY_RESET_THROTTLE_MS) {
        return;
      }
      lastResetAt = now;
      clearTimeout(timer);
      scheduleLock();
    };

    const listenerOptions: AddEventListenerOptions = { passive: true };
    window.addEventListener('mousemove', reset, listenerOptions);
    window.addEventListener('pointerdown', reset, listenerOptions);
    window.addEventListener('keydown', reset, listenerOptions);
    window.addEventListener('touchstart', reset, listenerOptions);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', reset, listenerOptions);
      window.removeEventListener('pointerdown', reset, listenerOptions);
      window.removeEventListener('keydown', reset, listenerOptions);
      window.removeEventListener('touchstart', reset, listenerOptions);
    };
  }, [unlocked, autoLockTimeoutMs, lock]);

  // ── Render ───────────────────────────────────────────────────────

  const value = useMemo<EnboxAuthContextValue>(() => ({
    connect,
    unlock,
    restore,
    retryInitialization,
    lock,
    changePin,
    verifyPin,
    adoptDwnEndpoints: applyAuthoritativeDwnEndpoints,
    dwnEndpoints,
    error,
    isLoading,
    isLocking,
  }), [
    connect,
    unlock,
    restore,
    retryInitialization,
    lock,
    changePin,
    verifyPin,
    applyAuthoritativeDwnEndpoints,
    dwnEndpoints,
    error,
    isLoading,
    isLocking,
  ]);

  return (
    <EnboxAuthContext.Provider value={value}>
      {children}
    </EnboxAuthContext.Provider>
  );
};
