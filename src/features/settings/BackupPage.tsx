import { useState, useCallback } from 'react';
import { Download, KeyRound, ShieldCheck, Copy, Check, Upload, AlertTriangle } from 'lucide-react';
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
  const identityCount = identities?.length ?? 0;

  return (
    <div className="space-y-6">
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
            Export Identities
          </h2>
          <span className="rounded-full bg-accent-muted px-2 py-0.5 text-xs font-medium text-accent">
            Recommended
          </span>
        </div>

        <p className="text-sm text-text-secondary">
          Export your identities as a portable JSON file. This is the <strong className="text-text-primary">most
          reliable way</strong> to back up your wallet — it preserves your exact DIDs, private keys,
          and all associated data.
        </p>

        <div className="flex items-center gap-3 rounded-lg bg-surface-2 p-3">
          <Upload className="h-4 w-4 text-text-tertiary shrink-0" />
          <p className="text-xs text-text-tertiary">
            To restore, use <strong>Import Identities</strong> from the sidebar after setting up a new wallet.
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-text-tertiary">
            {identityCount} {identityCount === 1 ? 'identity' : 'identities'} available
          </span>
          <Button
            onClick={handleExportAll}
            loading={exporting}
            disabled={identityCount === 0}
            size="sm"
          >
            <Download size={14} />
            Export All
          </Button>
        </div>
      </Card>

      {/* Recovery phrase — secondary backup */}
      <Card padding="lg" className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">
            Recovery Phrase
          </h2>
        </div>

        {phrase ? (
          <>
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <div className="text-sm text-warning space-y-1">
                  <p>
                    <strong>Important:</strong> The recovery phrase restores your <em>wallet vault</em> but
                    does not preserve your identity DIDs or profile data. For a full backup,
                    use <strong>Export Identities</strong> above.
                  </p>
                  <p>
                    Once confirmed, this phrase will be permanently removed from the app.
                  </p>
                </div>
              </div>
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
                  <><Check size={14} /> Copied</>
                ) : (
                  <><Copy size={14} /> Copy phrase</>
                )}
              </Button>
              <Button onClick={() => setShowConfirmDialog(true)} size="sm">
                <ShieldCheck size={14} /> I've saved it
              </Button>
            </div>
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
