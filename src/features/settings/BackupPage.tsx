import { useState, useCallback } from 'react';
import { Download, KeyRound, ShieldCheck, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useExportIdentity } from '@/enbox/hooks/use-identity-mutations';
import { copyToClipboard } from '@/lib/utils';

export default function BackupPage() {
  const phrase = useBackupSeedStore((s) => s.phrase);
  const confirmBackup = useBackupSeedStore((s) => s.confirmBackup);
  const { data: identities } = useIdentities();
  const exportIdentity = useExportIdentity();
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

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

  const handleExportAll = useCallback(async () => {
    if (!identities || identities.length === 0) {
      toast.error('No identities to export');
      return;
    }

    setExporting(true);
    try {
      const exported = [];
      for (const identity of identities) {
        const did = identity.did.uri;
        const data = await exportIdentity.mutateAsync(did);
        exported.push(data);
      }

      const blob = new Blob([JSON.stringify(exported, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enbox-identities-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(
        `Exported ${exported.length} ${exported.length === 1 ? 'identity' : 'identities'}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to export identities',
      );
    } finally {
      setExporting(false);
    }
  }, [identities, exportIdentity]);

  const words = phrase?.trim().split(/\s+/) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup & Recovery"
        description="Back up your wallet and manage recovery options."
        backTo="/settings"
      />

      {/* Recovery phrase */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">
            Recovery phrase
          </h2>
        </div>

        {phrase ? (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
              <p className="text-sm text-warning">
                Write these words down and store them safely. Once you confirm
                backup, this phrase will be permanently removed from the app
                and cannot be shown again.
              </p>
            </div>

            <div
              className="grid grid-cols-3 sm:grid-cols-4 gap-2"
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
                  <>
                    <Check size={14} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy phrase
                  </>
                )}
              </Button>
              <Button onClick={() => setShowConfirmDialog(true)} size="sm">
                <ShieldCheck size={14} /> I've backed it up
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-surface-2 p-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success mt-0.5" />
            <p className="text-sm text-text-secondary">
              Your recovery phrase has been backed up. It is no longer stored
              in the app for security.
            </p>
          </div>
        )}
      </Card>

      {/* Export all identities */}
      <Card padding="lg">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Download className="h-5 w-5 text-text-secondary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-medium text-text-primary">
                Export all identities
              </h2>
              <p className="text-xs text-text-tertiary">
                Download all identities as a JSON file for backup.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportAll}
            loading={exporting}
          >
            Export
          </Button>
        </div>
      </Card>

      {/* Confirmation dialog */}
      <Dialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        title="Confirm backup"
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
