import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router';
import { Download, Upload, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useImportIdentity } from '@/enbox/hooks/use-identity-mutations';
import { useDragDropStore } from '@/stores/drag-drop-store';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';

type FileStatus = 'pending' | 'importing' | 'success' | 'error';

interface ImportFile {
  name: string;
  data: unknown;
  status: FileStatus;
  error?: string;
}

export default function ImportIdentityPage() {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdentity = useImportIdentity();
  const consumeDroppedFiles = useDragDropStore((s) => s.consumeDroppedFiles);

  const readFiles = useCallback((fileList: FileList | File[]) => {
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          setFiles((prev) => [
            ...prev,
            { name: file.name, data, status: 'pending' },
          ]);
        } catch {
          setFiles((prev) => [
            ...prev,
            { name: file.name, data: null, status: 'error', error: 'Invalid JSON' },
          ]);
        }
      };
      reader.onerror = () => {
        setFiles((prev) => [
          ...prev,
          { name: file.name, data: null, status: 'error', error: 'Failed to read file' },
        ]);
      };
      reader.readAsText(file);
    });
  }, []);

  // Consume files from the global drag-drop overlay
  useEffect(() => {
    const dropped = consumeDroppedFiles();
    if (dropped.length > 0) {
      readFiles(dropped);
    }
  }, [consumeDroppedFiles, readFiles]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      readFiles(e.target.files);
      e.target.value = '';
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      readFiles(e.dataTransfer.files);
    }
  }

  async function handleImportAll() {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    setImporting(true);

    for (let i = 0; i < files.length; i++) {
      if (files[i].status !== 'pending') continue;

      setFiles((prev) =>
        prev.map((f, idx) => (idx === i ? { ...f, status: 'importing' } : f)),
      );

      try {
        await importIdentity.mutateAsync(files[i].data);
        setFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: 'success' } : f)),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed';
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: message } : f,
          ),
        );
      }
    }

    setImporting(false);

    const results = files.filter((f) => f.status !== 'pending');
    const successCount = results.filter((f) => f.status === 'success').length;
    if (successCount > 0) {
      toast.success(`Imported ${successCount} ${successCount === 1 ? 'identity' : 'identities'}`);
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const allDone = files.length > 0 && pendingCount === 0 && !importing;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import profiles"
        description="Bring profiles over from exported backup files."
        backTo="/"
      />

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-12',
          'transition-colors duration-[var(--duration-fast)]',
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-border-default bg-surface-1 hover:border-border-strong',
        )}
      >
        <Download className="h-10 w-10 text-text-ghost" />
        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">
            Drop identity files here
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            or
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          Browse files
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">
            Files ({files.length})
          </h2>
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-default bg-surface-1 overflow-hidden">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm text-text-primary truncate mr-3">
                  {file.name}
                </span>
                <span className="shrink-0">
                  {file.status === 'pending' && (
                    <span className="text-xs text-text-tertiary">Ready</span>
                  )}
                  {file.status === 'importing' && (
                    <span
                      className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin inline-block"
                      role="status"
                      aria-label="Importing"
                    />
                  )}
                  {file.status === 'success' && (
                    <CheckCircle className="h-4 w-4 text-success" />
                  )}
                  {file.status === 'error' && (
                    <span className="inline-flex items-center gap-1.5">
                      <XCircle className="h-4 w-4 text-error" />
                      <span className="text-xs text-error">{file.error}</span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <Button
                onClick={handleImportAll}
                loading={importing}
                disabled={pendingCount === 0}
              >
                Import {pendingCount} {pendingCount === 1 ? 'file' : 'files'}
              </Button>
            )}
            {allDone && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-text-secondary">
                  {successCount} of {files.length} imported successfully.
                </p>
                <Link to="/">
                  <Button variant="secondary" size="sm">
                    View identities
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
