import { create } from 'zustand';

export interface DWebConnectRequest {
  origin: string;
  data: unknown;
  timestamp: number;
}

export interface DWebConnectState {
  pendingRequests: DWebConnectRequest[];
  walletReady: boolean;
}

export interface DWebConnectActions {
  addRequest: (request: DWebConnectRequest) => void;
  /** Returns and removes the first pending request, or undefined if empty. */
  consumeRequest: () => DWebConnectRequest | undefined;
  setWalletReady: (ready: boolean) => void;
}

export type DWebConnectStore = DWebConnectState & DWebConnectActions;

export const useDWebConnectStore = create<DWebConnectStore>()((set, get) => ({
  pendingRequests: [],
  walletReady: false,

  addRequest: (request) =>
    set((state) => ({
      pendingRequests: [...state.pendingRequests, request],
    })),

  consumeRequest: () => {
    const { pendingRequests } = get();
    if (pendingRequests.length === 0) return undefined;
    const [first, ...rest] = pendingRequests;
    set({ pendingRequests: rest });
    return first;
  },

  setWalletReady: (ready) =>
    set({ walletReady: ready }),
}));
