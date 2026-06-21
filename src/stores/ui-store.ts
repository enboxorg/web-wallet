import { create } from 'zustand';
import { STORAGE_KEYS } from '@/lib/constants';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageGetEffect, localStorageSetEffect } from '@/lib/browser-effects';

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
  const stored = runEnboxSync(localStorageGetEffect(STORAGE_KEYS.THEME));
    if (stored === 'light' || stored === 'dark') {
      // Apply immediately so the DOM matches before first paint
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', stored);
      }
      return stored;
    }
  return 'dark';
}

function getInitialSidebarOpen(): boolean {
  // Default open on desktop (>= 1024px), closed on mobile
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 1024;
}

function applyTheme(theme: Theme): void {
  runEnboxSync(localStorageSetEffect(STORAGE_KEYS.THEME, theme));
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
