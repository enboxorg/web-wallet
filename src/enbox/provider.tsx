/**
 * EnboxAuthProvider — core authentication provider for the wallet.
 *
 * DESIGN PRINCIPLE: Let the SDK manage sync. The SDK's AuthManager handles
 * identity registration, sync start/stop, and WebSocket push/pull
 * automatically when sync is NOT set to 'off'. We only intervene for:
 * - Post-connect DWN tenant registration (the SDK handles this too when
 *   registration callbacks are provided, but we also do it manually to
 *   ensure all identity DIDs are registered as tenants)
 * - Seed phrase restore (importFromPhrase needs post-recovery sync to
 *   pull back original identities and their data)
 * - Inactivity auto-lock timer
 * - Session PIN caching for same-tab refresh persistence
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { AuthManager, requestLocalDwnDiscovery } from '@enbox/auth';

import { useAuthStore } from '@/stores/auth-store';
import { INACTIVITY_TIMEOUT_MS, SESSION_PIN_KEY, STORAGE_KEYS } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { ensureRegistration, getStoredTokens, storeTokens } from './registration';
import { installProtocols } from './protocols';
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
  restore: (recoveryPhrase: string, password: string, dwnEndpoints?: string[]) => Promise<void>;
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
  const authManagerRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setInitialized, setUnlocked, lock: storeLock } = useAuthStore();
  const unlocked = useAuthStore((s) => s.unlocked);

  // ── Post-session: ensure DWN tenant registration ─────────────────

  const ensurePostSession = useCallback(async (agent: EnboxAgent) => {
    // Register all DIDs as tenants on remote DWN endpoints
    try {
      await ensureRegistration(agent, DEFAULT_DWN_ENDPOINTS);
    } catch (err) {
      console.warn('EnboxAuthProvider: DWN tenant registration failed:', err);
    }

    // Register the agent DID for sync. The SDK only registers identity
    // DIDs, not the agent DID. But identity metadata and DID private
    // keys are stored as DWN records in the agent DID's local DWN.
    // Without this registration, those records never get pushed to the
    // remote, making seed-phrase recovery impossible.
    //
    // Since the SDK's connect/restoreSession already started sync before
    // we get here, registerIdentity only writes to the DB — the live
    // push subscription wasn't opened for the agent DID. We restart
    // sync so it picks up the new registration and opens a subscription.
    //
    // TODO(@enbox/auth): registerIdentity() should open a live push
    // subscription when sync is already running. And the agent DID
    // should be registered automatically.
    let needsSyncRestart = false;
    try {
      await agent.sync.registerIdentity({ did: agent.agentDid.uri });
      needsSyncRestart = true;
      console.info('[ensurePostSession] Agent DID registered for sync:', agent.agentDid.uri);
    } catch {
      // Already registered — no restart needed, subscription exists
    }

    if (needsSyncRestart) {
      try {
        await agent.sync.stopSync();
        await agent.sync.startSync({ mode: 'live', interval: '5m' });
        console.info('[ensurePostSession] Sync restarted with agent DID subscription');
      } catch (err) {
        console.warn('[ensurePostSession] Sync restart failed:', err);
      }
    }
  }, []);

  // ── Auto-restore from cached session PIN ─────────────────────────

  const tryAutoRestore = useCallback(async (auth: any): Promise<boolean> => { // eslint-disable-line @typescript-eslint/no-explicit-any
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
      await ensurePostSession(agent);
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

      if (!hasFragment && !cachedEndpoint) {
        requestLocalDwnDiscovery();
        await new Promise<void>((resolve) => setTimeout(resolve, DWN_DISCOVERY_TIMEOUT_MS));
        if (cancelled) return;
      }

      // Let the SDK manage sync — do NOT pass sync: 'off'.
      // The SDK will handle identity registration, sync start, and
      // WebSocket push/pull automatically.
      const auth = await AuthManager.create({
        dwnEndpoints: DEFAULT_DWN_ENDPOINTS,
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
      // localConnect: initializes vault, creates agent DID, starts sync.
      // We don't pass createIdentity: true because we handle identity
      // creation separately in the onboarding UI.
      const session = await auth.connect({
        password,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
      });

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      await ensurePostSession(agent);

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
      // restoreSession: unlocks vault, finds existing identity, starts sync.
      // Sync registrations persist in IndexedDB from the original connect.
      const session = await auth.restoreSession({ password });
      if (!session) throw new Error('Failed to restore session');

      const agent = session.agent as EnboxAgent;
      setUnlocked(agent);
      cacheSessionPin(password);
      await ensurePostSession(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unlock failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensurePostSession]);

  // ── Restore (from recovery phrase) ───────────────────────────────
  //
  // TODO(@enbox/auth): importFromPhrase() creates a spurious "Default"
  // identity before sync has a chance to pull the originals. The SDK
  // should either skip identity creation when recoveryPhrase is given,
  // or defer it until after sync pull. Until that's fixed, we use
  // auth.connect({ recoveryPhrase }) instead, which re-derives the
  // vault without creating an identity when createIdentity is not set.

  const restore = useCallback(async (recoveryPhrase: string, password: string, dwnEndpoints?: string[]): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    const endpoints = dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS;

    setIsLoading(true);
    setError(null);
    try {
      // Use connect() with recoveryPhrase instead of importFromPhrase().
      // This re-derives the vault from the seed phrase (same agent DID)
      // but does NOT create a spurious "Default" identity because we
      // don't pass createIdentity: true.
      const session = await auth.connect({
        password,
        recoveryPhrase,
        dwnEndpoints: endpoints,
      });

      const agent = session.agent as EnboxAgent;
      const agentDid = agent.agentDid.uri;

      // --- Post-recovery: pull original identities ---
      //
      // The vault is re-derived with the same agent DID. Identity
      // metadata and keys are stored in the agent DID's DWN on the
      // remote. We need to:
      // 1. Register agent DID for sync + as DWN tenant
      // 2. Pull → recovers identity metadata from agent DID's DWN
      // 3. Register recovered identity DIDs for sync + as tenants
      // 4. Pull again → recovers profile data for each identity
      // 5. Install protocols, restart sync

      try {
        await ensureRegistration(agent, endpoints);

        // Stop SDK-managed sync for controlled sequential pulls
        await agent.sync.stopSync();

        // Register agent DID for sync (SDK doesn't do this automatically)
        try { await agent.sync.registerIdentity({ did: agentDid }); } catch { /* already registered */ }

        // Pull 1: recover identity metadata
        console.info('[restore] Pull 1: recovering identity records...');
        await agent.sync.sync('pull');

        let identities = await agent.identity.list();
        console.info(`[restore] Found ${identities.length} identities after pull 1`);

        // Register all recovered identity DIDs for sync + as DWN tenants
        for (const identity of identities) {
          try { await agent.sync.registerIdentity({ did: identity.did.uri }); } catch { /* already registered */ }
        }
        await ensureRegistration(agent, endpoints);

        // Pull 2: recover profile data for each identity DID
        console.info('[restore] Pull 2: recovering identity data...');
        await agent.sync.sync('pull');

        identities = await agent.identity.list();
        console.info(`[restore] Found ${identities.length} identities after pull 2`);

        // Install protocols locally for each recovered identity
        for (const identity of identities) {
          try {
            await installProtocols(agent, identity.did.uri);
          } catch (err) {
            console.warn(`[restore] Protocol install for ${identity.did.uri}:`, err);
          }
        }

        // Push protocol configs to remote
        await agent.sync.sync('push');
      } catch (syncErr) {
        console.warn('[restore] Post-recovery sync error:', syncErr);
      }

      // Restart SDK-managed sync
      agent.sync.startSync({ mode: 'live', interval: '5m' }).catch((err: unknown) => {
        console.error('[restore] Sync restart failed:', err);
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
  }, [setUnlocked]);

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
