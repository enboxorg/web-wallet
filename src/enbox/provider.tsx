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
import { Effect } from 'effect';

import { useAuthStore } from '@/stores/auth-store';
import {
  getAutoLockTimeout,
  SESSION_PIN_KEY,
  SESSION_VAULT_PASSWORD_KEY,
  STORAGE_KEYS,
} from '@/lib/constants';
import {
  getConfiguredDwnEndpoints,
  normalizeDwnEndpoints,
  setConfiguredDwnEndpoints,
} from '@/lib/dwn-endpoints';
import {
  localStorageGetEffect,
  sessionStorageGetEffect,
  sessionStorageRemoveEffect,
  sessionStorageSetEffect,
} from '@/lib/browser-effects';
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

// ── Local DWN discovery (DORMANT — pending migration) ──────────────
//
// @enbox/auth 0.6.61 removed the wallet-driven `dwn://connect` auto-trigger
// in favor of an explicit, user-gesture localhost-pairing model, and the
// AuthManager now restores any previously paired local DWN on boot. The
// pre-auth discovery block below is kept intact but gated off so the
// in-progress pairing work can resume from here. Flip this to `true` (and
// migrate `requestLocalDwnDiscoveryEffect` to the new pairing API) to revive.
const LOCAL_DWN_DISCOVERY_ENABLED = false;
const DWN_DISCOVERY_TIMEOUT_MS = 3_000;
const AUTH_OPERATION_LOCK_KEY = 'auth:vault';

function getAgentDwnEndpoints(agent: EnboxAgent): string[] {
  const agentDid = agent.agentDid;
  const services = agentDid.document?.service;
  if (!Array.isArray(services)) {
    throw new Error('Agent DID does not contain a DWN service.');
  }

  const dwnServices = services.filter((service) =>
    service?.id === `${agentDid.uri}#dwn` && service?.type === 'DecentralizedWebNode'
  );
  if (dwnServices.length !== 1) {
    throw new Error('Agent DID must contain exactly one anchored DWN service.');
  }

  const serviceEndpoint = dwnServices[0].serviceEndpoint;
  const endpoints: unknown = typeof serviceEndpoint === 'string' ? [serviceEndpoint] : serviceEndpoint;
  if (!Array.isArray(endpoints) || !endpoints.every((endpoint): endpoint is string => typeof endpoint === 'string')) {
    throw new Error('Agent DID contains malformed DWN endpoints.');
  }
  return normalizeDwnEndpoints(endpoints as string[]);
}

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
  const activeAuthOperationRef = useRef<Promise<unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>(getConfiguredDwnEndpoints);

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

  const applyAuthoritativeDwnEndpoints = useCallback((endpoints: string[]): void => {
    setDwnEndpoints(endpoints);
    setConfiguredDwnEndpoints(endpoints);
  }, []);

  // ── Auto-restore from cached session vault password ──────────────

  const tryAutoRestore = useCallback(async (auth: WalletAuthManager): Promise<boolean> => {
    const cachedPassword = getCachedSessionPassword();
    if (!cachedPassword) return false;
    if (auth.state !== 'locked') return false;

    let sessionRestored = false;
    try {
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(restoreSessionEffect(auth, cachedPassword))
      );
      if (!session) {
        clearSessionPassword();
        return false;
      }
      sessionRestored = true;
      const agent = session.agent;
      const resolvedEndpoints = getAgentDwnEndpoints(agent);
      applyAuthoritativeDwnEndpoints(resolvedEndpoints);
      setUnlocked(agent);
      runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      })).catch((err: unknown) => {
        console.warn('EnboxAuthProvider: Failed to publish auto-restore event:', err);
      });
      return true;
    } catch {
      if (sessionRestored) {
        await runEnboxPromise(lockAuthManagerEffect(auth)).catch(() => {});
      }
      clearSessionPassword();
      return false;
    }
  }, [setUnlocked, applyAuthoritativeDwnEndpoints, runLockedAuthOperation]);

  // ── Phase 1: Create AuthManager on mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // DORMANT: see LOCAL_DWN_DISCOVERY_ENABLED above. Kept intact for the
      // in-progress local-DWN pairing migration; the AuthManager restores any
      // previously paired local DWN on boot, so this pre-auth trigger is off.
      if (LOCAL_DWN_DISCOVERY_ENABLED) {
        const hasFragment = globalThis.location?.hash?.length > 1;
        const cachedEndpoint = runEnboxSync(localStorageGetEffect(STORAGE_KEYS.LOCAL_DWN_ENDPOINT));

        // Only attempt local DWN discovery on desktop. On mobile/touch
        // devices there's no local DWN, and the dwn:// URL open triggers
        // a blocked popup warning in mobile browsers.
        const isTouchDevice = 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
        if (!hasFragment && !cachedEndpoint && !isTouchDevice) {
          await runEnboxPromise(
            requestLocalDwnDiscoveryUntilEndpointEffect(DWN_DISCOVERY_TIMEOUT_MS),
          );
          if (cancelled) return;
        }
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
    let sessionStarted = false;
    try {
      const requestedEndpoints = dwnEndpoints ?? getConfiguredDwnEndpoints();
      // connectVault initializes the vault, creates/registers the agent DID,
      // and starts sync. We intentionally skip createIdentity because the
      // wallet handles identity creation in its own UI.
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(connectVaultEffect(auth, password, requestedEndpoints)),
      );

      const agent = session.agent;
      sessionStarted = true;
      const authoritativeEndpoints = getAgentDwnEndpoints(agent);
      applyAuthoritativeDwnEndpoints(authoritativeEndpoints);
      setUnlocked(agent);
      sessionStarted = false;
      await runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      }));
      cacheSessionPassword(password);

      return session.recoveryPhrase;
    } catch (err) {
      if (sessionStarted) {
        await runEnboxPromise(lockAuthManagerEffect(auth)).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, applyAuthoritativeDwnEndpoints, runLockedAuthOperation]);

  // ── Unlock (returning user) ──────────────────────────────────────

  const unlock = useCallback(async (password: string): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    setIsLoading(true);
    setError(null);
    let sessionStarted = false;
    try {
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(restoreSessionEffect(auth, password)),
      );
      if (!session) throw new Error('Failed to restore session');

      const agent = session.agent;
      sessionStarted = true;
      const resolvedEndpoints = getAgentDwnEndpoints(agent);
      applyAuthoritativeDwnEndpoints(resolvedEndpoints);
      setUnlocked(agent);
      sessionStarted = false;
      await runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      }));
      cacheSessionPassword(password);
    } catch (err) {
      if (sessionStarted) {
        await runEnboxPromise(lockAuthManagerEffect(auth)).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : 'Unlock failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, applyAuthoritativeDwnEndpoints, runLockedAuthOperation]);

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
    let sessionStarted = false;
    try {
      const requestedEndpoints = dwnEndpoints ?? getConfiguredDwnEndpoints();
      const session = await runLockedAuthOperation(() =>
        runEnboxPromise(restoreFromPhraseEffect(auth, recoveryPhrase, password, requestedEndpoints)),
      );

      const agent = session.agent;
      sessionStarted = true;
      const authoritativeEndpoints = getAgentDwnEndpoints(agent);
      applyAuthoritativeDwnEndpoints(authoritativeEndpoints);
      setUnlocked(agent);
      sessionStarted = false;
      await runEnboxPromise(publishWalletEvent({
        _tag : 'identity.connected',
        did  : agent.agentDid.uri,
      }));
      cacheSessionPassword(password);
    } catch (err) {
      if (sessionStarted) {
        await runEnboxPromise(lockAuthManagerEffect(auth)).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, applyAuthoritativeDwnEndpoints, runLockedAuthOperation]);

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

  const value: EnboxAuthContextValue = {
    connect,
    unlock,
    restore,
    lock,
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
