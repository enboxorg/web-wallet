import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBackupSeedStore } from '../backup-seed-store';

// Mock localStorage for tests
const mockStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

const STORAGE_KEY = 'enbox:recovery-phrase';

describe('backup-seed-store', () => {
  beforeEach(() => {
    mockStorage.clear();
    useBackupSeedStore.setState({ phrase: null, backedUp: true });
  });

  describe('initial state', () => {
    it('starts with phrase as null when nothing in localStorage', () => {
      expect(useBackupSeedStore.getState().phrase).toBeNull();
    });

    it('starts with backedUp as true when no phrase stored', () => {
      expect(useBackupSeedStore.getState().backedUp).toBe(true);
    });
  });

  describe('setPhrase', () => {
    it('stores a recovery phrase in state and localStorage', () => {
      useBackupSeedStore.getState().setPhrase('abandon abandon abandon');
      expect(useBackupSeedStore.getState().phrase).toBe('abandon abandon abandon');
      expect(mockStorage.get(STORAGE_KEY)).toBe('abandon abandon abandon');
    });

    it('sets backedUp to false', () => {
      useBackupSeedStore.getState().setPhrase('test phrase');
      expect(useBackupSeedStore.getState().backedUp).toBe(false);
    });

    it('replaces a previous phrase', () => {
      useBackupSeedStore.getState().setPhrase('first phrase');
      useBackupSeedStore.getState().setPhrase('second phrase');
      expect(useBackupSeedStore.getState().phrase).toBe('second phrase');
      expect(mockStorage.get(STORAGE_KEY)).toBe('second phrase');
    });
  });

  describe('confirmBackup', () => {
    it('clears phrase from state and localStorage', () => {
      useBackupSeedStore.getState().setPhrase('important phrase');
      useBackupSeedStore.getState().confirmBackup();

      expect(useBackupSeedStore.getState().phrase).toBeNull();
      expect(mockStorage.has(STORAGE_KEY)).toBe(false);
    });

    it('sets backedUp to true', () => {
      useBackupSeedStore.getState().setPhrase('some phrase');
      expect(useBackupSeedStore.getState().backedUp).toBe(false);

      useBackupSeedStore.getState().confirmBackup();
      expect(useBackupSeedStore.getState().backedUp).toBe(true);
    });

    it('is safe to call when already backed up', () => {
      useBackupSeedStore.getState().confirmBackup();
      expect(useBackupSeedStore.getState().phrase).toBeNull();
      expect(useBackupSeedStore.getState().backedUp).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('supports set -> confirm -> set cycle', () => {
      useBackupSeedStore.getState().setPhrase('phrase-1');
      expect(useBackupSeedStore.getState().phrase).toBe('phrase-1');
      expect(useBackupSeedStore.getState().backedUp).toBe(false);

      useBackupSeedStore.getState().confirmBackup();
      expect(useBackupSeedStore.getState().phrase).toBeNull();
      expect(useBackupSeedStore.getState().backedUp).toBe(true);

      useBackupSeedStore.getState().setPhrase('phrase-2');
      expect(useBackupSeedStore.getState().phrase).toBe('phrase-2');
      expect(useBackupSeedStore.getState().backedUp).toBe(false);
    });

    it('phrase persists to localStorage across setPhrase calls', () => {
      useBackupSeedStore.getState().setPhrase('phrase-1');
      expect(mockStorage.get(STORAGE_KEY)).toBe('phrase-1');

      useBackupSeedStore.getState().setPhrase('phrase-2');
      expect(mockStorage.get(STORAGE_KEY)).toBe('phrase-2');
    });

    it('confirmBackup permanently removes from localStorage', () => {
      useBackupSeedStore.getState().setPhrase('phrase-1');
      expect(mockStorage.has(STORAGE_KEY)).toBe(true);

      useBackupSeedStore.getState().confirmBackup();
      expect(mockStorage.has(STORAGE_KEY)).toBe(false);
    });
  });
});
