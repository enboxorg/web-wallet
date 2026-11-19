import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router';
import { Download, Upload, CheckCircle, XCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';

import { useImportIdentity } from '@/enbox/hooks/use-identity-mutations';
import { useDragDropStore } from '@/stores/drag-drop-store';
import { Button } from '@/components/ui/Button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn, truncateDid } from '@/lib/utils';
import {
  decryptBackup,
  isEncryptedBackup,
  WrongBackupPasswordError,
  type EncryptedBackup,
} from '@/lib/encrypted-backup';

type EntryStatus = 'pending' | 'locked' | 'importing' | 'success' | 'error';

/** One profile to import, or one password-protected file still to unlock. */
interface ImportEntry {
  id: number;
  name: string;
  data: unknown;
  status: EntryStatus;
  error?: string;
  backup?: EncryptedBackup;
}

/** Best label for one exported profile inside a multi-profile file. */
function profileLabel(value: unknown, index: number): string {
  const portable = value as { metadata?: { name?: unknown }; portableDid?: { uri?: unknown } } | null;
  if (typeof portable?.metadata?.name === 'string' && portable.metadata.name.trim() !== '') {
    return portable.metadata.name;
  }
  if (typeof portable?.portableDid?.uri === 'string') {
    return truncateDid(portable.portableDid.uri);
  }
  return `Profile ${index + 1}`;
}

export default function ImportIdentityPage() {
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [passwords, setPasswords] = useState<Record<number, string>>({});
  const [unlocking, setUnlocking] = useState<number | null>(null);
  const nextId = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importIdentity = useImportIdentity();
  const consumeDroppedFiles = useDragDropStore((s) => s.consumeDroppedFiles);

  /** "Export all" writes an array; each profile in it becomes its own entry. */
  const toEntries = useCallback((fileName: string, data: unknown): ImportEntry[] => {
    if (isEncryptedBackup(data)) {
      return [{ id: nextId.current++, name: fileName, data: null, status: 'locked', backup: data }];
    }
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return [{ id: nextId.current++, name: fileName, data: null, status: 'error', error: 'No profiles in this file' }];
      }
      return data.map((item, index) => ({
        id     : nextId.current++,
        name   : data.length === 1 ? fileName : `${fileName} · ${profileLabel(item, index)}`,
        data   : item,
        status : 'pending',
      }));
    }
    return [{ id: nextId.current++, name: fileName, data, status: 'pending' }];
  }, []);

  const readFiles = useCallback((fileList: FileList | File[]) => {
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(reader.result as string);
        } catch {
          setEntries((prev) => [
            ...prev,
            { id: nextId.current++, name: file.name, data: null, status: 'error', error: 'Not a backup file' },
          ]);
          return;
        }
        setEntries((prev) => [...prev, ...toEntries(file.name, parsed)]);
      };
      reader.onerror = () => {
        setEntries((prev) => [
          ...prev,
          { id: nextId.current++, name: file.name, data: null, status: 'error', error: 'Failed to read file' },
        ]);
      };
      reader.readAsText(file);
    });
  }, [toEntries]);

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

  async function handleUnlock(entry: ImportEntry) {
    if (!entry.backup) return;
    setUnlocking(entry.id);
    try {
      const data = await decryptBackup(entry.backup, passwords[entry.id] ?? '');
      const unlocked = toEntries(entry.name, data);
      setEntries((prev) => prev.flatMap((item) => (item.id === entry.id ? unlocked : [item])));
      setPasswords(({ [entry.id]: _used, ...rest }) => rest);
    } catch (err) {
      const wrongPassword = err instanceof WrongBackupPasswordError;
      setEntries((prev) => prev.map((item) => (item.id === entry.id
        ? {
          ...item,
          // A wrong password can be retried; an unreadable file can't.
          status : wrongPassword ? 'locked' : 'error',
          error  : err instanceof Error ? err.message : 'Couldn’t unlock this file',
        }
        : item)));
    } finally {
      setUnlocking(null);
    }
  }

  async function handleImportAll() {
    const pending = entries.filter((entry) => entry.status === 'pending');
    if (pending.length === 0) return;

    setImporting(true);
    let imported = 0;
    const setStatus = (id: number, patch: Partial<ImportEntry>) => {
      setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
    };

    for (const entry of pending) {
      setStatus(entry.id, { status: 'importing' });
      try {
        await importIdentity.mutateAsync(entry.data);
        imported += 1;
        setStatus(entry.id, { status: 'success', error: undefined });
      } catch (err) {
        setStatus(entry.id, { status: 'error', error: err instanceof Error ? err.message : 'Import failed' });
      }
    }

    setImporting(false);
    if (imported > 0) {
      toast.success(`Imported ${imported} ${imported === 1 ? 'profile' : 'profiles'}`);
    }
  }

  const pendingCount = entries.filter((entry) => entry.status === 'pending').length;
  const lockedCount = entries.filter((entry) => entry.status === 'locked').length;
  const successCount = entries.filter((entry) => entry.status === 'success').length;
  const allDone = entries.length > 0 && pendingCount === 0 && lockedCount === 0 && !importing;

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
            Drop profile backup files here
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
          aria-label="Choose backup files"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Entries */}
      {entries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-text-secondary">
            To import ({entries.length})
          </h2>
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-default bg-surface-1 overflow-hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-primary truncate mr-3">
                    {entry.name}
                  </span>
                  <span className="shrink-0">
                    {entry.status === 'pending' && (
                      <span className="text-xs text-text-tertiary">Ready</span>
                    )}
                    {entry.status === 'locked' && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        Password protected
                      </span>
                    )}
                    {entry.status === 'importing' && (
                      <span
                        className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin inline-block"
                        role="status"
                        aria-label="Importing"
                      />
                    )}
                    {entry.status === 'success' && (
                      <CheckCircle className="h-4 w-4 text-success" aria-label="Imported" />
                    )}
                    {entry.status === 'error' && (
                      <span className="inline-flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-error" aria-hidden="true" />
                        <span className="text-xs text-error">{entry.error}</span>
                      </span>
                    )}
                  </span>
                </div>

                {entry.status === 'locked' && (
                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleUnlock(entry);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <Input
                        id={`backup-password-${entry.id}`}
                        type="password"
                        autoComplete="current-password"
                        aria-label={`Password for ${entry.name}`}
                        placeholder="Backup password"
                        value={passwords[entry.id] ?? ''}
                        onChange={(event) => setPasswords((prev) => ({ ...prev, [entry.id]: event.target.value }))}
                        error={entry.error}
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="secondary"
                      loading={unlocking === entry.id}
                      disabled={!(passwords[entry.id] ?? '') || (unlocking !== null && unlocking !== entry.id)}
                    >
                      Unlock
                    </Button>
                  </form>
                )}
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
                Import {pendingCount} {pendingCount === 1 ? 'profile' : 'profiles'}
              </Button>
            )}
            {allDone && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-text-secondary">
                  {successCount} of {entries.length} imported.
                </p>
                <Link to="/" className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
                  View profiles
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
