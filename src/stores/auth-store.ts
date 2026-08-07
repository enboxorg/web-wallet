import { create } from 'zustand';
import type { EnboxPlatformAgent } from '@enbox/agent';

type EnboxUserAgent = EnboxPlatformAgent;

export interface AuthState {
  /** Whether AuthManager has been created. */
  initialized: boolean;
  /** Whether the user has entered the correct PIN. */
  unlocked: boolean;
  /** No previous setup exists (first launch). */
  firstTime: boolean;
  /** The SDK agent instance. */
  agent: EnboxUserAgent | null;
}

export interface AuthActions {
  setInitialized: (value: boolean, firstTime: boolean) => void;
  setUnlocked: (agent: EnboxUserAgent) => void;
  lock: () => void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()((set) => ({
  initialized: false,
  unlocked: false,
  firstTime: false,
  agent: null,

  setInitialized: (value, firstTime) =>
    set({ initialized: value, firstTime }),

  setUnlocked: (agent) =>
    set({ initialized: true, unlocked: true, firstTime: false, agent }),

  lock: () =>
    set({ unlocked: false, agent: null }),
}));
