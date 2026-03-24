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

  const ensureTenantRegistration = useCallback(async (agent: EnboxAgent) => {
    try {
      await ensureRegistration(agent, DEFAULT_DWN_ENDPOINTS);
    } catch (err) {
      console.warn('EnboxAuthProvider: DWN tenant registration failed:', err);
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
      await ensureTenantRegistration(agent);
      return true;
    } catch {
      clearSessionPin();
      return false;
    }
  }, [setUnlocked, ensureTenantRegistration]);

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
      await ensureTenantRegistration(agent);

      return session.recoveryPhrase;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensureTenantRegistration]);

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
      await ensureTenantRegistration(agent);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unlock failed';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setUnlocked, ensureTenantRegistration]);

  // ── Restore (from recovery phrase) ───────────────────────────────

  const restore = useCallback(async (recoveryPhrase: string, password: string, dwnEndpoints?: string[]): Promise<void> => {
    const auth = authManagerRef.current;
    if (!auth) throw new Error('AuthManager not ready');

    const endpoints = dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS;

    setIsLoading(true);
    setError(null);
    try {
      // importFromPhrase: re-derives vault from seed, creates a default
      // identity, registers it for sync, starts sync.
      const session = await auth.importFromPhrase({
        recoveryPhrase,
        password,
        dwnEndpoints: endpoints,
      });

      const agent = session.agent as EnboxAgent;
      const agentDid = agent.agentDid.uri;

      // --- Post-recovery: pull original identities ---
      //
      // The seed re-derives the same agent DID. Identity metadata is stored
      // in the agent DID's local DWN and synced to the remote. We need to:
      // 1. Register the agent DID for sync (importFromPhrase doesn't do this)
      // 2. Stop sync briefly so we can do a controlled pull
      // 3. Pull agent DID records → recovers identity metadata
      // 4. Register recovered identity DIDs for sync + as DWN tenants
      // 5. Pull again → recovers identity profile data
      // 6. Clean up the empty default identity
      // 7. Restart sync

      try {
        // Ensure agent DID is registered as a tenant on remote DWNs
        await ensureRegistration(agent, endpoints);

        // Stop the SDK-managed sync so we can do controlled sequential pulls
        await agent.sync.stopSync();

        // Register agent DID for sync (not done by importFromPhrase)
        try { await agent.sync.registerIdentity({ did: agentDid }); } catch { /* already registered */ }

        // First pull: recover identity metadata from agent DID's DWN
        console.info('[restore] Pull 1: recovering identity records...');
        await agent.sync.sync('pull');

        const identities = await agent.identity.list();
        console.info(`[restore] Found ${identities.length} identities after pull 1`);

        // Remember the default identity to clean up later
        const preRecoveryIdentities = identities.filter(
          (id: any) => id.metadata.name === 'Default',
        );

        // Register ALL identity DIDs for sync + as DWN tenants
        for (const identity of identities) {
          const did = identity.did.uri;
          try { await agent.sync.registerIdentity({ did }); } catch { /* already registered */ }
        }
        await ensureRegistration(agent, endpoints);

        // Second pull: now that identity DIDs are registered, pull their
        // profile records, protocol configs, and other DWN data
        console.info('[restore] Pull 2: recovering identity data...');
        await agent.sync.sync('pull');

        // Install protocols locally for each identity
        const finalIdentities = await agent.identity.list();
        console.info(`[restore] Found ${finalIdentities.length} identities after pull 2`);
        for (const identity of finalIdentities) {
          try {
            await installProtocols(agent, identity.did.uri);
          } catch (err) {
            console.warn(`[restore] Protocol install for ${identity.did.uri}:`, err);
          }
        }

        // Clean up empty default identities if we recovered real ones
        const recoveredIdentities = finalIdentities.filter(
          (id: any) => id.metadata.name !== 'Default',
        );
        if (recoveredIdentities.length > 0) {
          for (const defaultId of preRecoveryIdentities) {
            try {
              console.info(`[restore] Removing default identity ${defaultId.did.uri}`);
              await agent.identity.delete({ didUri: defaultId.did.uri });
            } catch (err) {
              console.warn(`[restore] Failed to remove default identity:`, err);
            }
          }
        }

        // Push protocol configs to remote
        await agent.sync.sync('push');
      } catch (syncErr) {
        console.warn('[restore] Post-recovery sync error:', syncErr);
      }

      // Restart sync (SDK-managed from here on)
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
