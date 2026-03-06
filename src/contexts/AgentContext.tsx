import React, { createContext, useCallback, useEffect, useState } from "react";

import { AppProvider } from "@toolpad/core";

import type { EnboxUserAgent } from "@enbox/agent";
import { AuthManager, probeLocalDwn, requestLocalDwnDiscovery } from "@enbox/auth";
import type { AuthState, RegistrationTokenData } from "@enbox/auth";

import Loader from "@/components/Loader";
import LoadAgent from "@/components/LoadAgent";
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { darkTheme } from '@/theme/muiTheme';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/utils';

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
      auth.on('local-dwn-available', () => setLocalDwnAvailable(true));
      auth.on('local-dwn-unavailable', () => setLocalDwnAvailable(false));

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

  const unlock = useCallback(async (password: string) => {
    if (isConnecting || !authManager) return;

    setIsConnecting(true);
    try {
      const session = await authManager.restoreSession({ password });
      if (session) {
        setAgent(session.agent as EnboxUserAgent);
        setUnlocked(true);
      }
    } catch (error) {
      setIsConnecting(false);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [authManager, isConnecting]);

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

      setInitialized(true);
      setUnlocked(true);
      setAgent(session.agent as EnboxUserAgent);

      return session.recoveryPhrase;
    } catch (error) {
      setIsInitializing(false);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, [authManager]);

  const triggerLocalDwnDiscovery = useCallback(() => {
    // First try a direct probe (avoids the redirect if a DWN is already running).
    probeLocalDwn().then((endpoint) => {
      if (endpoint) {
        // A local DWN is already reachable — inject it into the agent cache.
        if (agent) {
          (agent as any).dwn?.setCachedLocalDwnEndpoint?.(endpoint);
        }
        setLocalDwnAvailable(true);
      } else {
        // No local DWN found via probe — trigger the dwn://register redirect.
        requestLocalDwnDiscovery();
      }
    }).catch(() => {
      // Probe failed — try the redirect flow anyway.
      requestLocalDwnDiscovery();
    });
  }, [agent]);

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
