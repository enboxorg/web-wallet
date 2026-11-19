import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Download } from 'lucide-react';
import { useDragDropStore } from '@/stores/drag-drop-store';

/**
 * Full-screen drag-and-drop overlay for importing identity files.
 * Renders inside the unlocked section of the app so it's always available.
 * On drop: stores files in the transient store and navigates to /identities/import.
 */
export function DragDropOverlay() {
  const [dragging, setDragging] = useState(false);
  const navigate = useNavigate();
  const setDroppedFiles = useDragDropStore((s) => s.setDroppedFiles);

  // Track nested dragenter/dragleave calls
  const [_dragCounter, setDragCounter] = useState(0);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => c + 1);
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragCounter((c) => {
      const next = c - 1;
      if (next <= 0) setDragging(false);
      return Math.max(0, next);
    });
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragCounter(0);
      setDragging(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // Filter to .json files
      const jsonFiles = Array.from(files).filter(
        (f) => f.name.endsWith('.json') || f.type === 'application/json',
      );
      if (jsonFiles.length === 0) return;

      setDroppedFiles(jsonFiles);
      navigate('/identities/import');
    },
    [navigate, setDroppedFiles],
  );

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop]);

  if (!dragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6 backdrop-blur-md animate-[fadeIn_0.15s_ease-out]">
      <div className="surface-card flex flex-col items-center gap-3 rounded-[2rem] border-2 border-dashed border-accent bg-surface-1 px-14 py-12 text-center shadow-pop">
        <span className="mb-2 flex size-16 items-center justify-center rounded-[20px] bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
          <Download className="size-7" aria-hidden="true" />
        </span>
        <p className="text-xl font-semibold tracking-tight text-text-primary">
          Drop profile files to import
        </p>
        <p className="font-mono text-xs text-text-tertiary">
          .json profile backups only
        </p>
      </div>
    </div>
  );
}
