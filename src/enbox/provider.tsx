/**
 * EnboxAuthProvider — core authentication provider for the wallet.
 *
 * Responsibilities:
 * - Creates the AuthManager on mount (with local DWN discovery)
 * - Determines first-time vs returning user and updates auth-store
 * - Provides connect / unlock / lock operations
 * - Runs post-session registration + sync on successful unlock
 * - Manages inactivity auto-lock timer
 * - Caches PIN in sessionStorage for same-tab refresh persistence
 *
 * This provider renders its children unconditionally — the auth gate
 * is handled by App.tsx reading from auth-store.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AuthManager, requestLocalDwnDiscovery } from '@enbox/auth';

import { useAuthStore } from '@/stores/auth-store';
import { INACTIVITY_TIMEOUT_MS, SESSION_PIN_KEY, STORAGE_KEYS, SYNC_INTERVAL } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { ensureRegistration, getStoredTokens, storeTokens } from './registration';
import { installProtocols } from './protocols';
import type { EnboxAgent } from './types';

// ── Local DWN discovery constants ──────────────────────────────────

/** How long to wait for a dwn://connect redirect before giving up. */
const DWN_DISCOVERY_TIMEOUT_MS = 3_000;

// ── Session PIN helpers ────────────────────────────────────────────

function cacheSessionPin(pin: string): void {
  try {
    sessionStorage.setItem(SESSION_PIN_KEY, pin);
  } catch {
    // sessionStorage may be unavailable (private browsing, storage quota)
  }
}

function getCachedSessionPin(): string | null {
  try {
    return sessionStorage.getItem(SESSION_PIN_KEY);
  } catch {
    return null;
  }
}

function clearSessionPin(): void {
  try {
    sessionStorage.removeItem(SESSION_PIN_KEY);
  } catch {
    // noop
  }
}

// ── Context ────────────────────────────────────────────────────────

export interface EnboxAuthContextValue {
  /** First-time setup: create identity & connect. Returns recovery phrase. */
  connect: (password: string, dwnEndpoints?: string[]) => Promise<string | undefined>;
  /** Returning user: restore session with password. */
  unlock: (password: string) => Promise<void>;
  /** Restore wallet from a BIP-39 recovery phrase. */
  restore: (recoveryPhrase: string, password: string, dwnEndpoints?: string[]) => Promise<void>;
  /** Lock the wallet (clear agent from memory). */
  lock: () => void;
  /** Current error message, if any. */
  error: string | null;
  /** Whether a connect/unlock operation is in progress. */
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
   
  const authManagerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setInitialized, setUnlocked, lock: storeLock } = useAuthStore();
  const unlocked = useAuthStore((s) => s.unlocked);

  // ── Post-session setup: registration + sync ──────────────────────

  const onSessionReady = useCallback(async (agent: EnboxAgent) => {
    try {
      await ensureRegistration(agent, DEFAULT_DWN_ENDPOINTS);
    } catch (err) {
      console.warn('EnboxAuthProvider: Post-session DWN registration failed:', err);
    }

    // Register the agent DID for sync. The agent DID's DWN stores
    // identity metadata (DwnIdentityStore) and DID private keys
    // (DwnKeyStore). Without this, those records never get pushed to
    // the remote, making seed-phrase recovery impossible.
    const agentDid = agent.agentDid.uri;
    console.info('[onSessionReady] Agent DID:', agentDid);
    try {
      await agent.sync.registerIdentity({ did: agentDid });
      console.info('[onSessionReady] Agent DID registered for sync');
    } catch (err) {
      console.info('[onSessionReady] Agent DID sync registration:', (err as Error).message);
    }

    // List what identities exist locally
    const ids = await agent.identity.list();
    console.info('[onSessionReady] Local identities:', ids.length, ids.map((i: any) => i.did.uri));

    // Start live sync now that all DIDs are registered.
    agent.sync.startSync({ mode: 'live', interval: SYNC_INTERVAL }).then(() => {
      console.info('[onSessionReady] Live sync started');
      // Do an immediate push to ensure agent DID records reach the remote
      return agent.sync.sync('push');
    }).then(() => {
      console.info('[onSessionReady] Initial push complete');
    }).catch((err: unknown) => {
      console.error('[onSessionReady] Sync failed:', err);
    });
  }, []);

  // ── Restore session from cached PIN (silent, no UI) ──────────────

  const tryAutoRestore = useCallback(async (auth: any): Promise<boolean> => {  
    const cachedPin = getCachedSessionPin();
    if (!cachedPin) return false;

    // Only attempt if the vault is initialized (returning user)
    if (auth.state !== 'locked') return false;

    try {
      const session = await auth.restoreSession({ password: cachedPin });
      if (!session) {
        clearSessionPin();
        return false;
      }

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      await onSessionReady(agent);
      return true;
    } catch {
      // Cached PIN was wrong (maybe changed), clear it
      clearSessionPin();
      return false;
    }
  }, [setUnlocked, onSessionReady]);

  // ── Phase 1: Create AuthManager on mount ─────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // --- Local DWN discovery (must happen BEFORE AuthManager.create) ---

      const hasFragment = globalThis.location?.hash?.length > 1;
      const cachedEndpoint = localStorage.getItem(STORAGE_KEYS.LOCAL_DWN_ENDPOINT);
      const hasKnownEndpoint = hasFragment || !!cachedEndpoint;

      if (!hasKnownEndpoint) {
        requestLocalDwnDiscovery();
        await new Promise<void>((resolve) => setTimeout(resolve, DWN_DISCOVERY_TIMEOUT_MS));
        if (cancelled) return;
      }

      // --- Create the AuthManager ---

      const auth = await AuthManager.create({
        dwnEndpoints: DEFAULT_DWN_ENDPOINTS,
        sync: 'off',
        localDwnStrategy: 'prefer',
        registration: {
          onSuccess: () => console.info('EnboxAuthProvider: DWN registration complete'),
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

      // --- Try auto-restore from cached session PIN ---
      const autoRestored = await tryAutoRestore(auth);

      if (cancelled) return;

      if (!autoRestored) {
        // No cached session — show the appropriate auth screen
        const firstTime = auth.state === 'uninitialized';
        setInitialized(true, firstTime);
      } else {
        // Auto-restored — mark as initialized + unlocked (setUnlocked already called)
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
      const session = await auth.connect({
        password,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
      });

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      await onSessionReady(agent);

      return session.recoveryPhrase;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, onSessionReady]);

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
      await onSessionReady(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unlock failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, onSessionReady]);

  // ── Restore (from recovery phrase) ────────────────────────────────

  const restore = useCallback(async (recoveryPhrase: string, password: string, dwnEndpoints?: string[]): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    const endpoints = dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS;

    setIsLoading(true);
    setError(null);
    try {
      const session = await auth.importFromPhrase({
        recoveryPhrase,
        password,
        dwnEndpoints: endpoints,
      });

      const agent = session.agent as EnboxAgent;
      const agentDid = agent.agentDid.uri;

      // --- Recovery sync ---
      //
      // The HD vault re-derives the same agent DID from the seed phrase.
      // Identity metadata and DID private keys are stored as DWN records
      // in the agent DID's local DWN, and (if agent DID was registered
      // for sync) pushed to the remote DWN.
      //
      // importFromPhrase() creates an empty "Default" identity because
      // the local DWN is empty before sync. After we pull from remote,
      // the original identities should appear. We then clean up the
      // empty "Default" identity if originals were recovered.
      //
      // Note: The SDK's importFromPhrase does NOT register the agent DID
      // for sync — it only registers the new default identity DID.
      // This means identity records on the remote are only recoverable
      // if WE register the agent DID (which onSessionReady now does on
      // every session, so newly created wallets will have this).

      // Remember the default identity the SDK just created (to clean up later)
      const preRecoveryIdentities = await agent.identity.list();
      const defaultIdentityDid = preRecoveryIdentities.length === 1
        ? preRecoveryIdentities[0].did.uri
        : undefined;

      try {
        await ensureRegistration(agent, endpoints);

        // Register the agent DID for sync so we can pull identity records.
        try {
          await agent.sync.registerIdentity({ did: agentDid });
        } catch {
          // Already registered
        }

        // Also register the default identity DID (SDK already did this,
        // but ensure it has DWN endpoint resolution).
        if (defaultIdentityDid) {
          try {
            await agent.sync.registerIdentity({ did: defaultIdentityDid });
          } catch {
            // Already registered
          }
        }

        // Pull everything from remote.
        await agent.sync.sync('pull');

        // Check what we recovered.
        const identities = await agent.identity.list();
        console.info(`Restore: found ${identities.length} identities after sync pull`);

        // If we recovered original identities beyond the default,
        // clean up the empty "Default" identity the SDK created.
        if (defaultIdentityDid && identities.length > 1) {
          const hasRealIdentities = identities.some(
            (id: any) => id.did.uri !== defaultIdentityDid,
          );
          if (hasRealIdentities) {
            try {
              console.info(`Restore: removing empty default identity ${defaultIdentityDid}`);
              await agent.identity.delete({ didUri: defaultIdentityDid });
              await agent.sync.unregisterIdentity(defaultIdentityDid);
            } catch (err) {
              console.warn('Restore: failed to clean up default identity:', err);
            }
          }
        }

        // Register all (possibly recovered) identities for ongoing sync
        // and install their protocols locally.
        const finalIdentities = await agent.identity.list();
        for (const identity of finalIdentities) {
          const did = identity.did.uri;
          try {
            await agent.sync.registerIdentity({ did });
          } catch {
            // Already registered
          }
          try {
            await installProtocols(agent, did);
          } catch (err) {
            console.warn(`Restore: protocol install for ${did}:`, err);
          }
        }

        // Push protocol configs + any local changes to remote.
        await agent.sync.sync('push');
      } catch (syncErr) {
        console.warn('Restore: post-recovery sync failed:', syncErr);
      }

      // Start live sync for ongoing operation.
      agent.sync.startSync({ mode: 'live', interval: SYNC_INTERVAL }).catch((err: unknown) => {
        console.error('Restore: sync start failed:', err);
      });

      setUnlocked(agent);
      cacheSessionPin(password);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, onSessionReady]);

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

    let timer: ReturnType<typeof setTimeout> = setTimeout(lock, INACTIVITY_TIMEOUT_MS);

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, INACTIVITY_TIMEOUT_MS);
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
