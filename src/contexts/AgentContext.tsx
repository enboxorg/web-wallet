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

/**
 * How long to wait for a `dwn://connect` redirect to come back before
 * giving up and proceeding without a local DWN. This only applies on
 * the very first visit when no cached endpoint exists.
 *
 * The round-trip is local (browser → OS → electrobun-dwn → browser),
 * so it completes in well under a second when a handler is installed.
 * If the timeout expires it means no `dwn://` handler is registered.
 */
const DWN_DISCOVERY_TIMEOUT_MS = 3_000;

/**
 * The localStorage key where `@enbox/auth` persists the discovered local
 * DWN endpoint. This mirrors `BrowserStorage.prefix + STORAGE_KEYS.LOCAL_DWN_ENDPOINT`.
 */
const LOCAL_DWN_ENDPOINT_LS_KEY = 'enbox:enbox:auth:localDwnEndpoint';

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
  /** Whether a local DWN server is available (discovered via dwn://connect). */
  localDwnAvailable: boolean;
  /** Trigger the dwn://connect flow to discover a local DWN. */
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

  // Ref-mirror of localDwnAvailable so we can read it synchronously
  // inside callbacks without stale closure issues.
  const localDwnAvailableRef = useRef(false);

  // ─── Phase 1: Pre-agent local DWN discovery ────────────────────
  //
  // HARD REQUIREMENT: If a local DWN server is running, the agent MUST
  // be created in remote mode (no in-process DWN). Discovery must
  // complete BEFORE AuthManager.create() is called.
  //
  // Discovery channels (browser):
  //   1. URL fragment — a dwn://connect redirect just landed (highest priority)
  //   2. localStorage — a previously discovered and persisted endpoint
  //   3. dwn://connect trigger — fire the protocol handler redirect and
  //      wait briefly; if the handler is installed the page will reload
  //      with the endpoint in the fragment before the timeout expires.
  //
  // Only after discovery resolves (or times out) do we create the AuthManager.

  useEffect(() => {
    let cancelled = false;

    const initializeWithDiscovery = async () => {
      // Channel 1: Check if we're returning from a dwn://connect redirect.
      // We only check for the fragment's PRESENCE here — do NOT consume it.
      // discoverLocalDwn() inside AuthManager.create() will read, validate,
      // persist, and clear the fragment.
      const hasFragment = globalThis.location?.hash?.length > 1;

      // Channel 2: Check localStorage for a previously persisted endpoint.
      const cachedEndpoint = localStorage.getItem(LOCAL_DWN_ENDPOINT_LS_KEY);

      const hasKnownEndpoint = hasFragment || !!cachedEndpoint;

      if (!hasKnownEndpoint) {
        // Channel 3: No endpoint known — trigger the dwn://connect flow.
        // If electrobun-dwn is running, it will redirect back to this page
        // with the endpoint in the URL fragment. The round-trip is local
        // (sub-second). If no handler is installed, nothing happens and
        // the timeout below fires.
        //
        // We wait for the redirect because creating the agent in local
        // mode when a local DWN IS available violates the core design:
        // there must NEVER be an in-process DWN if a local server exists.
        requestLocalDwnDiscovery();

        // Wait for the redirect to come back. If the page navigates
        // (redirect succeeded), this code is destroyed and never
        // reaches the AuthManager.create() call below. If the timeout
        // fires, no local DWN handler is installed — proceed without one.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, DWN_DISCOVERY_TIMEOUT_MS);
        });

        if (cancelled) return;
      }

      // ─── Phase 2: Create the AuthManager ──────────────────────────
      //
      // discoverLocalDwn() inside AuthManager.create() will:
      //   - Read and consume the URL fragment (if present), validate via
      //     GET /info, and persist the endpoint to localStorage.
      //   - Or read the cached endpoint from localStorage and re-validate.

      const auth = await AuthManager.create({
        dwnEndpoints     : DEFAULT_DWN_ENDPOINTS,
        sync             : '5m',
        localDwnStrategy : 'prefer',
        registration     : {
          onSuccess: () => console.info('AgentContext: DWN registration complete'),
          onFailure: (err) => console.warn('AgentContext: DWN registration failed:', err),
          onProviderAuthRequired: async ({ authorizeUrl, state }) => {
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

      // Track whether a local DWN was discovered.
      if (auth.localDwnEndpoint) {
        localDwnAvailableRef.current = true;
        setLocalDwnAvailable(true);
      }

      // Listen for local DWN discovery events for future changes.
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

    initializeWithDiscovery();
    return () => { cancelled = true; };
  }, []);

  const lock = useCallback(async () => {
    if (!authManager) return;
    await authManager.lock();
    setAgent(undefined);
    setUnlocked(false);
  }, [authManager]);

  // Post-session setup: register DIDs with DWN endpoints.
  // Called after both connect() and restoreSession().
  //
  // NOTE: Local DWN discovery is handled BEFORE AuthManager.create() in
  // Phase 1 above. By the time a session starts, the agent is already
  // in the correct mode (remote if a local DWN was found, local otherwise).
  const onSessionReady = useCallback((userAgent: EnboxUserAgent) => {
    ensureRegistration(userAgent, DEFAULT_DWN_ENDPOINTS).catch((err) => {
      console.warn('AgentContext: Post-session DWN registration failed:', err);
    });
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
    // Trigger the dwn://connect protocol handler redirect. The local DWN
    // handler (electrobun-dwn) will redirect back to this page with the
    // endpoint in the URL fragment. On reload, Phase 1 discovery will
    // pick it up and create the agent in remote mode.
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
          !authManager && <Loader message="Loading..." /> ||
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
