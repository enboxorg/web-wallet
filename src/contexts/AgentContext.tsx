import React, { createContext, useCallback, useEffect, useState } from "react";

import { AppProvider } from "@toolpad/core";

import { Web5UserAgent } from "@enbox/agent";

import Loader from "@/components/Loader";
import LoadAgent from "@/components/LoadAgent";
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { darkTheme } from '@/theme/muiTheme';
import { registerDidWithDwn } from '@/lib/dwn-registration';

/** The amount of time of inactivity before the wallet is locked */
const LOCK_TIMEOUT = 10 * 60 * 1000;

interface Web5ContextProps {
  agent?: Web5UserAgent;
  initialized: boolean;
  unlocked: boolean;
  lock: () => Promise<void>;
}

export const AgentContext = createContext<Web5ContextProps>({
  unlocked: false,
  initialized: false,
  lock: async () => {},
});

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [web5Agent, setWeb5Agent] = useState<Web5UserAgent | undefined>(undefined);

  const [initialized, setInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const [isConnecting, setIsConnecting] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let loading = false;

    const loadAgent = async () => {
      if (loading) return;
      loading = true;
      const agent = await Web5UserAgent.create();
      setInitialized(!await agent.firstLaunch());
      setWeb5Agent(agent);
      loading = false;
    }

    if (!web5Agent) {
      loadAgent();
    }

  }, [web5Agent]);

  const lock = useCallback(async () => {
    if (web5Agent) {
      localStorage.removeItem('password');
      await web5Agent.vault.lock();
      setUnlocked(false);
    }
  }, [ web5Agent, setUnlocked ]);

  const unlock = useCallback(async (password: string) => {
    if (isConnecting) {
      return;
    }

    if (!web5Agent) {
      throw new Error("Agent not initialized");
    }

    if (unlocked) {
      return;
    }

    setIsConnecting(true);
    try {
        await web5Agent.start({ password });
        localStorage.setItem('password', password);
        setWeb5Agent(web5Agent);
        setUnlocked(true);
        web5Agent.sync.startSync({ interval: '15s' });
    } catch (error) {
      setIsConnecting(false);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [ web5Agent, unlocked, isConnecting ]);

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

  useEffect(() => {
    if (web5Agent && initialized && !unlocked) {
      const password = localStorage.getItem('password');
      if (password) {
        unlock(password);
      }
    }
  }, [ web5Agent, initialized, unlocked, unlock ]);

  const initialize = useCallback(async (password: string, dwnEndpoint: string): Promise<string | undefined> => {
    if (!web5Agent) {
      throw new Error("Agent not initialized");
    }

    setIsInitializing(true);
    try {
      if (await web5Agent.firstLaunch()) {
        const recoveryPhrase = await web5Agent.initialize({ password, dwnEndpoints: [ dwnEndpoint ] });
        await web5Agent.start({ password });
        localStorage.setItem('password', password);

        // Register the agent DID as a tenant on the DWN server.
        try {
          await registerDidWithDwn(dwnEndpoint, web5Agent.agentDid.uri);
        } catch (error) {
          console.warn('Agent DID registration failed (will retry on next identity creation):', error);
        }

        await web5Agent.sync.registerIdentity({ did: web5Agent.agentDid.uri });
        await web5Agent.sync.sync('pull');
        web5Agent.sync.startSync({ interval: '15s' });
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
  }, [ web5Agent ]);

  return (<AgentContext.Provider
      value={{
        lock,
        unlocked,
        initialized,
        agent: web5Agent,
      }}
    >
      {(initialized && unlocked && web5Agent) ? children : <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <AppProvider>
          {(isInitializing || isConnecting) && <Loader message={isInitializing ? "Initializing Agent..." : "Connecting..."} /> ||
          <LoadAgent
            agent={web5Agent}
            initialized={initialized}
            unlock={unlock}
            initialize={initialize}
          />}
        </AppProvider>
      </ThemeProvider>}
    </AgentContext.Provider>
  );
};
