import { create } from 'zustand';

const STORAGE_KEY = 'enbox:recovery-phrase';

export interface BackupSeedState {
  /**
   * The recovery phrase, persisted in localStorage until the user
   * explicitly confirms they have backed it up.
   * null = either never set (no wallet) or already backed up.
   */
  phrase: string | null;
  /** Whether the user has confirmed the backup. */
  backedUp: boolean;
}

export interface BackupSeedActions {
  /** Store the phrase (called after first-time connect). */
  setPhrase: (phrase: string) => void;
  /** User confirms backup — clears phrase from storage permanently. */
  confirmBackup: () => void;
}

export type BackupSeedStore = BackupSeedState & BackupSeedActions;

function loadPhrase(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export const useBackupSeedStore = create<BackupSeedStore>()((set) => ({
  phrase: loadPhrase(),
  backedUp: loadPhrase() === null,

  setPhrase: (phrase) => {
    try {
      localStorage.setItem(STORAGE_KEY, phrase);
    } catch {
      // Storage unavailable — phrase will be in-memory only
    }
    set({ phrase, backedUp: false });
  },

  confirmBackup: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // noop
    }
    set({ phrase: null, backedUp: true });
  },
}));
