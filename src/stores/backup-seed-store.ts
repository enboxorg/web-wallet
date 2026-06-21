import { create } from 'zustand';
import { runEnboxSync } from '@/enbox/effect/runtime';
import {
  localStorageGetEffect,
  localStorageRemoveEffect,
  localStorageSetEffect,
} from '@/lib/browser-effects';

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
  return runEnboxSync(localStorageGetEffect(STORAGE_KEY));
}

export const useBackupSeedStore = create<BackupSeedStore>()((set) => ({
  phrase: loadPhrase(),
  backedUp: loadPhrase() === null,

  setPhrase: (phrase) => {
    runEnboxSync(localStorageSetEffect(STORAGE_KEY, phrase));
    set({ phrase, backedUp: false });
  },

  confirmBackup: () => {
    runEnboxSync(localStorageRemoveEffect(STORAGE_KEY));
    set({ phrase: null, backedUp: true });
  },
}));
