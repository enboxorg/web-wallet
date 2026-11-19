import { useState } from 'react';
import { Lock } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { backupPasswordProblem, MIN_BACKUP_PASSWORD_LENGTH } from '@/lib/encrypted-backup';

interface BackupPasswordDialogProps {
  open: boolean;
  /** What is being exported, e.g. "3 profiles" or "Brave Cedar". */
  subject: string;
  onClose: () => void;
  /** Encrypt and download with the chosen password. */
  onConfirm: (password: string) => Promise<void>;
}

/**
 * Ask for the password that protects an exported backup file. Exports hold
 * private keys, so they are never written unprotected from here.
 */
export function BackupPasswordDialog({ open, subject, onClose, onConfirm }: BackupPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const problem = backupPasswordProblem(password, confirmation);

  function close() {
    if (busy) return;
    setPassword('');
    setConfirmation('');
    setAttempted(false);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (problem) return;
    setBusy(true);
    try {
      await onConfirm(password);
      setPassword('');
      setConfirmation('');
      setAttempted(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Protect your backup">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-text-secondary">
          The backup of {subject} includes private keys, so it&apos;s locked with a password. You&apos;ll
          need it to import the file, and it can&apos;t be recovered if you forget it.
        </p>
        <Input
          label="Backup password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_BACKUP_PASSWORD_LENGTH} characters. A few random words work well.`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={attempted && problem ? problem : undefined}
        />
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={busy}>
            {!busy && <Lock className="size-3.5" aria-hidden="true" />}
            Export protected file
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
