import { describe, it, expect, beforeEach, vi } from 'vitest';
import { STORAGE_KEYS } from '@/lib/constants';

// We need to mock localStorage and window before importing the store,
// because the store reads from them at creation time.

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    _store: store,
    _reset: () => {
      store = {};
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('ui-store', () => {
  beforeEach(async () => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();

    // Reset module registry so the store re-initializes with fresh localStorage
    vi.resetModules();
  });

  async function importStore() {
    const mod = await import('../ui-store');
    return mod.useUIStore;
  }

  describe('initial state', () => {
    it('defaults theme to "dark" when localStorage is empty', async () => {
      const useUIStore = await importStore();
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('reads theme from localStorage if set to "light"', async () => {
      localStorageMock.setItem(STORAGE_KEYS.THEME, 'light');
      const useUIStore = await importStore();
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('falls back to "dark" for invalid localStorage theme', async () => {
      localStorageMock.setItem(STORAGE_KEYS.THEME, 'invalid');
      const useUIStore = await importStore();
      expect(useUIStore.getState().theme).toBe('dark');
    });

    it('defaults sidebarMini to false', async () => {
      const useUIStore = await importStore();
      expect(useUIStore.getState().sidebarMini).toBe(false);
    });
  });

  describe('toggleSidebar', () => {
    it('toggles sidebarOpen', async () => {
      const useUIStore = await importStore();
      const initial = useUIStore.getState().sidebarOpen;
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(!initial);
    });

    it('toggles back to original value on double toggle', async () => {
      const useUIStore = await importStore();
      const initial = useUIStore.getState().sidebarOpen;
      useUIStore.getState().toggleSidebar();
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(initial);
    });
  });

  describe('setSidebarOpen', () => {
    it('sets sidebarOpen to the given value', async () => {
      const useUIStore = await importStore();
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe('setSidebarMini', () => {
    it('sets sidebarMini to the given value', async () => {
      const useUIStore = await importStore();
      useUIStore.getState().setSidebarMini(true);
      expect(useUIStore.getState().sidebarMini).toBe(true);
      useUIStore.getState().setSidebarMini(false);
      expect(useUIStore.getState().sidebarMini).toBe(false);
    });
  });

  describe('setTheme', () => {
    it('updates theme state', async () => {
      const useUIStore = await importStore();
      useUIStore.getState().setTheme('light');
      expect(useUIStore.getState().theme).toBe('light');
    });

    it('persists theme to localStorage', async () => {
      const useUIStore = await importStore();
      useUIStore.getState().setTheme('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.THEME,
        'light',
      );
    });

    it('sets data-theme attribute on documentElement', async () => {
      const useUIStore = await importStore();
      useUIStore.getState().setTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe(
        'light',
      );
    });

    it('can switch back to dark', async () => {
      const useUIStore = await importStore();
      useUIStore.getState().setTheme('light');
      useUIStore.getState().setTheme('dark');
      expect(useUIStore.getState().theme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });
});
