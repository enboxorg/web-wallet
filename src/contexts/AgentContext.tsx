import React, { createContext, useCallback, useEffect, useRef, useState } from "react";

import { AppProvider } from "@toolpad/core";

import type { EnboxUserAgent } from "@enbox/agent";
import { AuthManager, requestLocalDwnDiscovery } from "@enbox/auth";
import type { RegistrationTokenData } from "@enbox/auth";

import Loader from "@/components/Loader";
import LoadAgent from "@/components/LoadAgent";
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { darkTheme } from '@/theme/muiTheme';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/utils';
import { getStoredTokens, storeTokens, registerDidWithEndpoint } from '@/lib/registration';

/** The amount of time of inactivity before the wallet is locked */
const LOCK_TIMEOUT = 10 * 60 * 1000;

// ─── Registration token persistence (localStorage) ─────────────
const REG_TOKENS_KEY = 'enbox:registrationTokens';

function getStoredRegTokens(): Record<string, RegistrationTokenData> {
  try {
    const raw = localStorage.getItem(REG_TOKENS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function storeRegTokens(tokens: Record<string, RegistrationTokenData>): void {
  localStorage.setItem(REG_TOKENS_KEY, JSON.stringify(tokens));
}

// ─── Context shape ──────────────────────────────────────────────

interface AgentContextProps {
  agent?: EnboxUserAgent;
  initialized: boolean;
  unlocked: boolean;
  lock: () => Promise<void>;
  /** Whether a local DWN is available (discovered via dwn:// or port probe). */
  localDwnAvailable: boolean;
  /** Trigger the dwn://register flow to discover a local DWN. */
  triggerLocalDwnDiscovery: () => void;
}

export const AgentContext = createContext<AgentContextProps>({
  unlocked: false,
  initialized: false,
  lock: async () => {},
  localDwnAvailable: false,
  triggerLocalDwnDiscovery: () => {},
});

// ─── Post-session registration ──────────────────────────────────
//
// AuthManager's `restoreSession()` does NOT call `registerWithDwnEndpoints()`.
// Registration only runs inside `connect()` (first launch).  So on every
// unlock we manually ensure the agent DID and connected DID are registered
// as tenants on all configured DWN endpoints using the existing
// `registration.ts` module.

async function ensureRegistration(userAgent: EnboxUserAgent, dwnEndpoints: string[]): Promise<void> {
  const agentDid = userAgent.agentDid.uri;

  // Collect all identity DIDs that need registration.
  const identities = await userAgent.identity.list();
  const didsToRegister = new Set<string>([agentDid]);
  for (const identity of identities) {
    didsToRegister.add(identity.metadata.connectedDid ?? identity.did.uri);
  }

  let tokens = getStoredTokens();

  for (const dwnEndpoint of dwnEndpoints) {
    try {
      const serverInfo = await userAgent.rpc.getServerInfo(dwnEndpoint);

      for (const did of didsToRegister) {
        try {
          tokens = await registerDidWithEndpoint(dwnEndpoint, did, serverInfo, tokens);
        } catch (error) {
          console.warn(`DWN registration of ${did} with ${dwnEndpoint} failed:`, error);
        }
      }
    } catch (error) {
      console.warn(`Could not reach DWN endpoint ${dwnEndpoint} for registration:`, error);
    }
  }

  storeTokens(tokens);
}

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authManager, setAuthManager] = useState<AuthManager | undefined>(undefined);
  const [agent, setAgent] = useState<EnboxUserAgent | undefined>(undefined);

  const [initialized, setInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [localDwnAvailable, setLocalDwnAvailable] = useState(false);

  // Track whether we've already triggered the dwn://register redirect
  // in this page session to avoid spamming the user.
  const dwnDiscoveryTriggeredRef = useRef(false);

  // Ref-mirror of localDwnAvailable so we can read it synchronously
  // inside onSessionReady() without stale closure issues.
  const localDwnAvailableRef = useRef(false);

  // Create the AuthManager once on mount.
  useEffect(() => {
    let cancelled = false;

    const createAuth = async () => {
      const auth = await AuthManager.create({
        dwnEndpoints     : DEFAULT_DWN_ENDPOINTS,
        sync             : '5m',
        localDwnStrategy : 'prefer',
        registration     : {
          onSuccess: () => console.info('AgentContext: DWN registration complete'),
          onFailure: (err) => console.warn('AgentContext: DWN registration failed:', err),
          onProviderAuthRequired: async ({ authorizeUrl, state }) => {
            // Auto-approve provider auth (same as the old registration.ts logic).
            const response = await fetch(authorizeUrl, {
              signal: AbortSignal.timeout(30_000),
            });
            if (!response.ok) {
              const text = await response.text();
              throw new Error(`Provider auth failed (${response.status}): ${text}`);
            }
            const { code, state: returnedState } = await response.json() as { code: string; state: string };
            if (returnedState !== state) {
              throw new Error('Provider auth state mismatch — possible CSRF');
            }
            return { code, state: returnedState };
          },
          registrationTokens    : getStoredRegTokens(),
          onRegistrationTokens  : storeRegTokens,
        },
      });

      if (cancelled) return;

      // Listen for local DWN discovery events.
      // Update both the React state (for rendering) and the ref (for
      // synchronous reads in onSessionReady).
      auth.on('local-dwn-available', () => {
        localDwnAvailableRef.current = true;
        setLocalDwnAvailable(true);
      });
      auth.on('local-dwn-unavailable', () => {
        localDwnAvailableRef.current = false;
        setLocalDwnAvailable(false);
      });

      setAuthManager(auth);
      setInitialized(auth.state !== 'uninitialized');
    };

    createAuth();
    return () => { cancelled = true; };
  }, []);

  const lock = useCallback(async () => {
    if (!authManager) return;
    await authManager.lock();
    setAgent(undefined);
    setUnlocked(false);
  }, [authManager]);

  // Post-session setup: register DIDs with DWN endpoints and trigger
  // local DWN discovery.  Called after both connect() and restoreSession().
  const onSessionReady = useCallback((userAgent: EnboxUserAgent) => {
    // 1. Ensure all DIDs are registered with remote DWN endpoints.
    ensureRegistration(userAgent, DEFAULT_DWN_ENDPOINTS).catch((err) => {
      console.warn('AgentContext: Post-session DWN registration failed:', err);
    });

    // 2. Auto-trigger dwn://register if no local DWN was discovered yet.
    //    applyLocalDwnDiscovery() already ran inside connect()/restoreSession()
    //    and checked the URL fragment + localStorage.  If that found an
    //    endpoint, the 'local-dwn-available' event will have fired
    //    synchronously and set localDwnAvailableRef — skip the redirect.
    //
    //    If nothing was found, trigger the protocol handler redirect (once
    //    per page session).  We skip probeLocalDwn() because in browsers
    //    the fetch() calls to 127.0.0.1:55500-55509 are typically blocked
    //    by CORS/ad-blockers, producing noisy ERR_BLOCKED_BY_CLIENT errors.
    //    The dwn:// redirect is the proper browser discovery channel.
    if (!dwnDiscoveryTriggeredRef.current && !localDwnAvailableRef.current) {
      // Small delay to let the UI settle after unlock before opening a
      // protocol handler (which may flash a system dialog).
      setTimeout(() => {
        if (!dwnDiscoveryTriggeredRef.current && !localDwnAvailableRef.current) {
          dwnDiscoveryTriggeredRef.current = true;
          requestLocalDwnDiscovery();
        }
      }, 1500);
    }
  }, []);

  const unlock = useCallback(async (password: string) => {
    if (isConnecting || !authManager) return;

    setIsConnecting(true);
    try {
      const session = await authManager.restoreSession({ password });
      if (session) {
        const userAgent = session.agent as EnboxUserAgent;
        setAgent(userAgent);
        setUnlocked(true);
        onSessionReady(userAgent);
      }
    } catch (error) {
      setIsConnecting(false);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [authManager, isConnecting, onSessionReady]);

  // Inactivity timer: lock the wallet after LOCK_TIMEOUT of no activity.
  useEffect(() => {
    if (!unlocked) return;

    let inactivityTimer: NodeJS.Timeout = setTimeout(() => {
      lock();
    }, LOCK_TIMEOUT);

    const resetActivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        lock();
      }, LOCK_TIMEOUT);
    };

    window.addEventListener('mousemove', resetActivityTimer);
    window.addEventListener('keypress', resetActivityTimer);

    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener('mousemove', resetActivityTimer);
      window.removeEventListener('keypress', resetActivityTimer);
    };
  }, [unlocked, lock]);

  const initialize = useCallback(async (password: string, dwnEndpoints: string[]): Promise<string | undefined> => {
    if (!authManager) {
      throw new Error("AuthManager not ready");
    }

    setIsInitializing(true);
    try {
      const session = await authManager.connect({
        password,
        dwnEndpoints,
      });

      const userAgent = session.agent as EnboxUserAgent;
      setInitialized(true);
      setUnlocked(true);
      setAgent(userAgent);

      // connect() runs registration internally, but errors are swallowed
      // (logged via onFailure).  Run our own registration as a safety net.
      onSessionReady(userAgent);

      return session.recoveryPhrase;
    } catch (error) {
      setIsInitializing(false);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, [authManager, onSessionReady]);

  const triggerLocalDwnDiscovery = useCallback(() => {
    // In the browser, direct port probing (probeLocalDwn) is unreliable —
    // fetches to 127.0.0.1:{55500-55509} are blocked by CORS and ad-blockers.
    // Instead, always use the dwn://register protocol handler redirect.
    // The local DWN handler (electrobun-dwn) will redirect back to this page
    // with the actual endpoint in the URL fragment, which applyLocalDwnDiscovery()
    // picks up on the next connect/restore cycle.
    requestLocalDwnDiscovery();
  }, []);

  return (<AgentContext.Provider
      value={{
        lock,
        unlocked,
        initialized,
        agent,
        localDwnAvailable,
        triggerLocalDwnDiscovery,
      }}
    >
      {(initialized && unlocked && agent) ? children : <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <AppProvider>
          {(isInitializing || isConnecting) && <Loader message={isInitializing ? "Initializing Agent..." : "Connecting..."} /> ||
          <LoadAgent
            initialized={initialized}
            ready={!!authManager}
            unlock={unlock}
            initialize={initialize}
          />}
        </AppProvider>
      </ThemeProvider>}
    </AgentContext.Provider>
  );
};
