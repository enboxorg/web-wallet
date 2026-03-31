import React, { createContext, useCallback, useEffect, useState } from "react";

import { AppProvider } from "@toolpad/core";

import { EnboxUserAgent } from "@enbox/agent";

import Loader from "@/components/Loader";
import LoadAgent from "@/components/LoadAgent";
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { darkTheme } from '@/theme/muiTheme';
import { getStoredTokens, storeTokens, registerDidWithEndpoint } from '@/lib/registration';

/** The amount of time of inactivity before the wallet is locked */
const LOCK_TIMEOUT = 10 * 60 * 1000;

interface AgentContextProps {
  agent?: EnboxUserAgent;
  initialized: boolean;
  unlocked: boolean;
  lock: () => Promise<void>;
}

export const AgentContext = createContext<AgentContextProps>({
  unlocked: false,
  initialized: false,
  lock: async () => {},
});

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [enboxAgent, setEnboxAgent] = useState<EnboxUserAgent | undefined>(undefined);

  const [initialized, setInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const [isConnecting, setIsConnecting] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let loading = false;

    const loadAgent = async () => {
      if (loading) return;
      loading = true;
      const agent = await EnboxUserAgent.create();
      setInitialized(!await agent.firstLaunch());
      setEnboxAgent(agent);
      loading = false;
    }

    if (!enboxAgent) {
      loadAgent();
    }

  }, [enboxAgent]);

  const lock = useCallback(async () => {
    if (enboxAgent) {
      // Close the DID resolver cache so LevelDB handles are released.
      // The cache re-opens lazily on the next resolve() call after unlock.
      // AgentDidApi extends UniversalResolver which has close() — use cast
      // since the type declarations don't always surface it.
      try {
        await (enboxAgent.did as unknown as { close(): Promise<void> }).close();
      } catch {
        // Ignore — cache may already be closed or not yet opened.
      }

      await enboxAgent.vault.lock();
      setUnlocked(false);
    }
  }, [ enboxAgent, setUnlocked ]);

  const unlock = useCallback(async (password: string) => {
    if (isConnecting) {
      return;
    }

    if (!enboxAgent) {
      throw new Error("Agent not initialized");
    }

    if (unlocked) {
      return;
    }

    setIsConnecting(true);
    try {
        await enboxAgent.start({ password });

        // Eager pull before rendering children: ensures identity metadata
        // created on other devices is available when loadIdentities() runs
        // on mount. The "Connecting…" spinner stays visible during this.
        try {
          await enboxAgent.sync.sync('pull');
        } catch {
          // May fail if no identities registered yet — continue.
        }

        setEnboxAgent(enboxAgent);
        setUnlocked(true);
        enboxAgent.sync.startSync({ mode: 'live', interval: '5m' });
    } catch (error) {
      setIsConnecting(false);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [ enboxAgent, unlocked, isConnecting ]);

  // Inactivity timer: lock the wallet after LOCK_TIMEOUT of no activity.
  // Listeners are added once when unlocked and cleaned up when locked or unmounted.
  useEffect(() => {
    if (!unlocked) {
      return;
    }

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
  }, [ unlocked, lock ]);

  const initialize = useCallback(async (password: string, dwnEndpoints: string[]): Promise<string | undefined> => {
    if (!enboxAgent) {
      throw new Error("Agent not initialized");
    }

    setIsInitializing(true);
    try {
      if (await enboxAgent.firstLaunch()) {
        const recoveryPhrase = await enboxAgent.initialize({ password, dwnEndpoints });
        await enboxAgent.start({ password });

        // Register the agent DID as a tenant on each DWN endpoint.
        let tokens = getStoredTokens();
        for (const endpoint of dwnEndpoints) {
          try {
            const serverInfo = await enboxAgent.rpc.getServerInfo(endpoint);
            tokens = await registerDidWithEndpoint(endpoint, enboxAgent.agentDid.uri, serverInfo, tokens);
          } catch (error) {
            console.warn(`Agent DID registration with ${endpoint} skipped:`, error);
          }
        }
        storeTokens(tokens);

        await enboxAgent.sync.registerIdentity({ did: enboxAgent.agentDid.uri });
        await enboxAgent.sync.sync('pull');
        enboxAgent.sync.startSync({ mode: 'live', interval: '5m' });
        setInitialized(true);
        setUnlocked(true);
        return recoveryPhrase;
      }
    } catch (error) {
      setIsInitializing(false);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, [ enboxAgent ]);

  return (<AgentContext.Provider
      value={{
        lock,
        unlocked,
        initialized,
        agent: enboxAgent,
      }}
    >
      {(initialized && unlocked && enboxAgent) ? children : <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <AppProvider>
          {(isInitializing || isConnecting) && <Loader message={isInitializing ? "Initializing Agent..." : "Connecting..."} /> ||
          <LoadAgent
            agent={enboxAgent}
            initialized={initialized}
            unlock={unlock}
            initialize={initialize}
          />}
        </AppProvider>
      </ThemeProvider>}
    </AgentContext.Provider>
  );
};
