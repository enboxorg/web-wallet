import { describe, it, expect, beforeEach } from 'vitest';

import { useDragDropStore } from '../drag-drop-store';

/** Helper to create a minimal File object for testing. */
function makeFile(name: string, content = 'test'): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('drag-drop-store', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useDragDropStore.setState({ droppedFiles: [] });
  });

  // ── Initial state ─────────────────────────────────────────────────

  describe('initial state', () => {
    it('starts with an empty droppedFiles array', () => {
      expect(useDragDropStore.getState().droppedFiles).toEqual([]);
    });
  });

  // ── setDroppedFiles ───────────────────────────────────────────────

  describe('setDroppedFiles', () => {
    it('stores files in state', () => {
      const files = [makeFile('a.txt'), makeFile('b.txt')];
      useDragDropStore.getState().setDroppedFiles(files);
      expect(useDragDropStore.getState().droppedFiles).toEqual(files);
    });

    it('replaces previously set files', () => {
      const first = [makeFile('first.txt')];
      const second = [makeFile('second.txt')];
      useDragDropStore.getState().setDroppedFiles(first);
      useDragDropStore.getState().setDroppedFiles(second);
      expect(useDragDropStore.getState().droppedFiles).toEqual(second);
    });

    it('accepts an empty array', () => {
      useDragDropStore.getState().setDroppedFiles([makeFile('file.txt')]);
      useDragDropStore.getState().setDroppedFiles([]);
      expect(useDragDropStore.getState().droppedFiles).toEqual([]);
    });

    it('stores the exact file references', () => {
      const file = makeFile('exact.txt');
      useDragDropStore.getState().setDroppedFiles([file]);
      expect(useDragDropStore.getState().droppedFiles[0]).toBe(file);
    });
  });

  // ── consumeDroppedFiles ───────────────────────────────────────────

  describe('consumeDroppedFiles', () => {
    it('returns the currently stored files', () => {
      const files = [makeFile('consume.txt')];
      useDragDropStore.getState().setDroppedFiles(files);
      const consumed = useDragDropStore.getState().consumeDroppedFiles();
      expect(consumed).toEqual(files);
    });

    it('clears droppedFiles after consuming', () => {
      useDragDropStore.getState().setDroppedFiles([makeFile('gone.txt')]);
      useDragDropStore.getState().consumeDroppedFiles();
      expect(useDragDropStore.getState().droppedFiles).toEqual([]);
    });

    it('returns an empty array when no files are stored', () => {
      const consumed = useDragDropStore.getState().consumeDroppedFiles();
      expect(consumed).toEqual([]);
    });

    it('returns an empty array on second consume (files already consumed)', () => {
      useDragDropStore.getState().setDroppedFiles([makeFile('once.txt')]);
      useDragDropStore.getState().consumeDroppedFiles();
      const second = useDragDropStore.getState().consumeDroppedFiles();
      expect(second).toEqual([]);
    });

    it('returns the exact file references', () => {
      const file = makeFile('ref.txt');
      useDragDropStore.getState().setDroppedFiles([file]);
      const consumed = useDragDropStore.getState().consumeDroppedFiles();
      expect(consumed[0]).toBe(file);
    });
  });

  // ── Lifecycle / state transitions ─────────────────────────────────

  describe('lifecycle', () => {
    it('supports set → consume → set → consume cycle', () => {
      const batch1 = [makeFile('batch1-a.txt'), makeFile('batch1-b.txt')];
      const batch2 = [makeFile('batch2-a.txt')];

      // First cycle
      useDragDropStore.getState().setDroppedFiles(batch1);
      expect(useDragDropStore.getState().droppedFiles).toHaveLength(2);
      const consumed1 = useDragDropStore.getState().consumeDroppedFiles();
      expect(consumed1).toEqual(batch1);
      expect(useDragDropStore.getState().droppedFiles).toEqual([]);

      // Second cycle
      useDragDropStore.getState().setDroppedFiles(batch2);
      expect(useDragDropStore.getState().droppedFiles).toHaveLength(1);
      const consumed2 = useDragDropStore.getState().consumeDroppedFiles();
      expect(consumed2).toEqual(batch2);
      expect(useDragDropStore.getState().droppedFiles).toEqual([]);
    });

    it('setDroppedFiles after consume repopulates state', () => {
      useDragDropStore.getState().setDroppedFiles([makeFile('first.txt')]);
      useDragDropStore.getState().consumeDroppedFiles();
      expect(useDragDropStore.getState().droppedFiles).toEqual([]);

      const newFiles = [makeFile('new.txt')];
      useDragDropStore.getState().setDroppedFiles(newFiles);
      expect(useDragDropStore.getState().droppedFiles).toEqual(newFiles);
    });

    it('multiple setDroppedFiles without consume keeps only the latest', () => {
      useDragDropStore.getState().setDroppedFiles([makeFile('a.txt')]);
      useDragDropStore.getState().setDroppedFiles([makeFile('b.txt')]);
      useDragDropStore.getState().setDroppedFiles([makeFile('c.txt')]);

      const files = useDragDropStore.getState().droppedFiles;
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('c.txt');
    });
  });
});
