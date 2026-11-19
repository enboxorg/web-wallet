import { useState, useCallback } from 'react';
import { Download, KeyRound, ShieldCheck, Copy, Check, Upload, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { BackupPasswordDialog } from '@/components/backup/BackupPasswordDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useExportIdentity } from '@/enbox/hooks/use-identity-mutations';
import { copyToClipboard, formatRelativeTime } from '@/lib/utils';
import { downloadJsonFile, encryptBackup } from '@/lib/encrypted-backup';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageGetEffect, localStorageSetEffect } from '@/lib/browser-effects';

const LAST_EXPORT_STORAGE_KEY = 'enbox:lastExportTimestamp';

export default function BackupPage() {
  const phrase = useBackupSeedStore((s) => s.phrase);
  const confirmBackup = useBackupSeedStore((s) => s.confirmBackup);
  const { data: identities } = useIdentities();
  const exportIdentity = useExportIdentity();
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // The phrase stays hidden until asked for, so it isn't exposed to anyone
  // who can see the screen just because this page was opened.
  const [revealed, setRevealed] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(() =>
    runEnboxSync(localStorageGetEffect(LAST_EXPORT_STORAGE_KEY))
  );

  const handleCopy = useCallback(async () => {
    if (!phrase) return;
    const ok = await copyToClipboard(phrase);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [phrase]);

  const handleConfirmBackup = useCallback(() => {
    confirmBackup();
    setShowConfirmDialog(false);
    toast.success('Recovery phrase backup confirmed');
  }, [confirmBackup]);

  const handleExportAll = useCallback(async (password: string) => {
    if (!identities || identities.length === 0) {
      toast.error('No profiles to export');
      return;
    }

    try {
      const exported = [];
      for (const identity of identities) {
        const did = identity.did.uri;
        const data = await exportIdentity.mutateAsync(did);
        exported.push(data);
      }

      const backup = await encryptBackup(exported, password);
      downloadJsonFile(`enbox-profiles-${new Date().toISOString().slice(0, 10)}.json`, backup);

      toast.success(
        `Exported ${exported.length} ${exported.length === 1 ? 'profile' : 'profiles'} to a protected file`,
      );
      const now = Date.now().toString();
      runEnboxSync(localStorageSetEffect(LAST_EXPORT_STORAGE_KEY, now));
      setLastExport(now);
      setExportDialogOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to export profiles',
      );
    }
  }, [identities, exportIdentity]);

  const words = phrase?.trim().split(/\s+/) ?? [];
  const identityCount = identities?.length ?? 0;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Backup & Recovery"
        description="Back up your wallet and manage recovery options."
        backTo="/settings"
      />

      {/* Identity Export — PRIMARY backup method */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-medium text-text-primary">
            Export profiles
          </h2>
          <span className="rounded-full bg-accent-muted px-2 py-0.5 text-xs font-medium text-accent">
            Recommended
          </span>
        </div>

        <p className="text-sm text-text-secondary">
          Download every profile, including its keys, as one backup file. It works even if
          your sync servers are unavailable. The file is <strong className="text-text-primary">locked
          with a password</strong> you choose, so keep that password somewhere safe.
        </p>

        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <Upload className="h-4 w-4 text-text-tertiary shrink-0" />
          <p className="text-xs text-text-tertiary">
            To restore from a backup file, use{' '}
            <Link to="/identities/import" className="font-medium text-text-secondary underline-offset-2 hover:underline">
              Import profiles
            </Link>
            .
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-text-tertiary">
              {identityCount} {identityCount === 1 ? 'profile' : 'profiles'} to export
            </span>
            {lastExport && (
              <span className="text-xs text-text-ghost">
                Last export: {formatRelativeTime(parseInt(lastExport, 10))}
              </span>
            )}
          </div>
          <Button
            onClick={() => setExportDialogOpen(true)}
            disabled={identityCount === 0}
            size="sm"
          >
            <Download size={14} />
            Export all
          </Button>
        </div>
      </Card>

      {/* Recovery phrase — secondary backup */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">
            Recovery phrase
          </h2>
        </div>

        {phrase ? (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="text-sm text-warning space-y-1">
                  <p>
                    <strong>Write these words down and keep them private.</strong> They restore this
                    wallet on a new device, along with any profiles that have synced. Anyone who has
                    them can do the same.
                  </p>
                  <p>
                    Once you confirm you've saved them, the wallet removes them from this device for good.
                  </p>
                </div>
              </div>
            </div>

            {revealed ? (
              <>
                <div
                  className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 gap-2"
                  role="list"
                  aria-label="Recovery phrase words"
                >
                  {words.map((word, i) => (
                    <div
                      key={i}
                      role="listitem"
                      className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 border border-border-subtle"
                    >
                      <span className="text-xs text-text-ghost w-5 text-right">
                        {i + 1}.
                      </span>
                      <span className="font-mono text-sm text-text-primary">
                        {word}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button variant="secondary" onClick={handleCopy} size="sm">
                    {copied ? (
                      <><Check size={14} /> Copied</>
                    ) : (
                      <><Copy size={14} /> Copy phrase</>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => setRevealed(false)} size="sm">
                    <EyeOff size={14} /> Hide
                  </Button>
                  <Button onClick={() => setShowConfirmDialog(true)} size="sm" className="sm:ml-auto">
                    <ShieldCheck size={14} /> I've saved it
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-default bg-surface-2/60 px-4 py-6 text-center">
                <EyeOff className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
                <p className="text-sm text-text-secondary">
                  Your {words.length}-word phrase is hidden. Make sure no one can see your screen.
                </p>
                <Button variant="secondary" size="sm" onClick={() => setRevealed(true)}>
                  <Eye size={14} /> Show phrase
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success mt-0.5" />
            <p className="text-sm text-text-secondary">
              Your recovery phrase has been confirmed. It is no longer stored
              in the app for security.
            </p>
          </div>
        )}
      </Card>

      <BackupPasswordDialog
        open={exportDialogOpen}
        subject={`${identityCount} ${identityCount === 1 ? 'profile' : 'profiles'}`}
        onClose={() => setExportDialogOpen(false)}
        onConfirm={handleExportAll}
      />

      {/* Confirmation dialog */}
      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="Confirm phrase backup"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you've saved your recovery phrase? Once confirmed, it
            will be permanently removed from the app and <strong className="text-text-primary">cannot be shown
            again</strong>.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleConfirmBackup}>
              Yes, I've saved it
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
