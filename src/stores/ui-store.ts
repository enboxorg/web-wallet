import { create } from 'zustand';
import { STORAGE_KEYS } from '@/lib/constants';

export type Theme = 'dark' | 'light';

export interface UIState {
  sidebarOpen: boolean;
  sidebarMini: boolean;
  theme: Theme;
}

export interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarMini: (mini: boolean) => void;
  setTheme: (theme: Theme) => void;
}

export type UIStore = UIState & UIActions;

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage may be unavailable (SSR, privacy mode, etc.)
  }
  return 'dark';
}

function getInitialSidebarOpen(): boolean {
  // Default open on desktop (>= 1024px), closed on mobile
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 1024;
}

function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch {
    // ignore
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export const useUIStore = create<UIStore>()((set) => ({
  sidebarOpen: getInitialSidebarOpen(),
  sidebarMini: false,
  theme: getInitialTheme(),

  toggleSidebar: () =>
    set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) =>
    set({ sidebarOpen: open }),

  setSidebarMini: (mini) =>
    set({ sidebarMini: mini }),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
}));
