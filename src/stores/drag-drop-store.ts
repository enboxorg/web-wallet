import { create } from 'zustand';

interface DragDropState {
  droppedFiles: File[];
  setDroppedFiles: (files: File[]) => void;
  consumeDroppedFiles: () => File[];
}

/** Transient store to pass dropped files from the global overlay to the import page. */
export const useDragDropStore = create<DragDropState>()((set, get) => ({
  droppedFiles: [],
  setDroppedFiles: (files) => set({ droppedFiles: files }),
  consumeDroppedFiles: () => {
    const { droppedFiles } = get();
    set({ droppedFiles: [] });
    return droppedFiles;
  },
}));
