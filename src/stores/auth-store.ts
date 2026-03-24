import { create } from 'zustand';

/**
 * We use `any` for SDK types to avoid importing heavy @enbox packages
 * into the store layer. The actual typing comes from the auth provider.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EnboxUserAgent = any;

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
    set({ unlocked: true, agent }),

  lock: () =>
    set({ unlocked: false, agent: null }),
}));
