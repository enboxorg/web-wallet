import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, Pencil, Download, Trash2, Copy, Check, QrCode, UserX } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import {
  useDeleteIdentity,
  useExportIdentity,
} from '@/enbox/hooks/use-identity-mutations';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Loader } from '@/components/ui/Loader';
import { TabList, Tab, TabPanel } from '@/components/ui/Tabs';
import { truncateDid, copyToClipboard } from '@/lib/utils';

import OverviewTab from './tabs/OverviewTab';
import ProtocolsTab from './tabs/ProtocolsTab';
import WalletsTab from './tabs/WalletsTab';
import PermissionsTab from './tabs/PermissionsTab';
import ActivityTab from './tabs/ActivityTab';

const TABS = ['Overview', 'Protocols', 'Wallets', 'Permissions', 'Activity'] as const;
const tabId = (i: number) => `identity-tab-${i}`;
const panelId = (i: number) => `identity-panel-${i}`;

export default function IdentityDetailsPage() {
  const { did: rawDid } = useParams<{ did: string }>();
  const did = rawDid ? decodeURIComponent(rawDid) : '';
  const navigate = useNavigate();

  const { data: identities, isLoading: identitiesLoading } = useIdentities();
  const { data: profile, isLoading: profileLoading } = useProfile(did);
  const deleteIdentity = useDeleteIdentity();
  const exportIdentity = useExportIdentity();

  const identity = useMemo(
    () => identities?.find((id: any) => id.did.uri === did),
    [identities, did],
  );

  const [activeTab, setActiveTab] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);

  async function handleCopyDid() {
    const ok = await copyToClipboard(did);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleExport() {
    try {
      const data = await exportIdentity.mutateAsync(did);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `identity-${truncateDid(did, 6)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Identity exported');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to export identity',
      );
    }
  }

  async function handleDelete() {
    try {
      await deleteIdentity.mutateAsync(did);
      toast.success('Identity deleted');
      navigate('/');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete identity',
      );
    }
  }

  if (identitiesLoading || profileLoading) {
    return <Loader message="Loading identity..." />;
  }

  if (!identity && !identitiesLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <UserX size={48} className="text-text-ghost" />
        <h1 className="text-xl font-semibold text-text-primary">Identity not found</h1>
        <p className="text-sm text-text-secondary">
          This identity may have been deleted or the DID is invalid.
        </p>
        <Link to="/">
          <Button>Go to Identities</Button>
        </Link>
      </div>
    );
  }

  const displayName = profile?.displayName || 'Unnamed';
  const persona = identity?.metadata?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {/* Back arrow — visible on mobile/tablet, hidden on desktop (sidebar handles nav) */}
          <Link
            to="/"
            className="mt-1.5 rounded-lg p-1.5 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors lg:hidden"
            aria-label="Back to identities"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Avatar
            src={profile?.avatarUrl}
            name={displayName}
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[length:var(--text-2xl)] font-semibold text-text-primary truncate">
                {displayName}
              </h1>
              {persona && (
                <span className="shrink-0 rounded-full bg-accent-muted px-2.5 py-0.5 text-xs font-medium text-accent">
                  {persona}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleCopyDid}
              className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm text-text-tertiary hover:text-text-primary transition-colors"
              title="Copy DID"
            >
              {truncateDid(did)}
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setQrOpen(true)}
            title="Share DID"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Link to={`/identity/${encodeURIComponent(did)}/edit`}>
            <Button variant="secondary" size="sm">
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Edit</span>
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exportIdentity.isPending}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <TabList>
        {TABS.map((label, index) => (
          <Tab
            key={label}
            id={tabId(index)}
            panelId={panelId(index)}
            active={activeTab === index}
            onClick={() => setActiveTab(index)}
          >
            {label}
          </Tab>
        ))}
      </TabList>

      <TabPanel id={panelId(0)} labelledBy={tabId(0)} active={activeTab === 0}>
        <OverviewTab did={did} />
      </TabPanel>
      <TabPanel id={panelId(1)} labelledBy={tabId(1)} active={activeTab === 1}>
        <ProtocolsTab did={did} />
      </TabPanel>
      <TabPanel id={panelId(2)} labelledBy={tabId(2)} active={activeTab === 2}>
        <WalletsTab did={did} />
      </TabPanel>
      <TabPanel id={panelId(3)} labelledBy={tabId(3)} active={activeTab === 3}>
        <PermissionsTab did={did} />
      </TabPanel>
      <TabPanel id={panelId(4)} labelledBy={tabId(4)} active={activeTab === 4}>
        <ActivityTab did={did} />
      </TabPanel>

      {/* Share DID QR dialog */}
      <Dialog
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title="Share Identity"
      >
        <div className="flex flex-col items-center gap-5">
          {/* QR code on white background for scan visibility in any theme */}
          <div className="rounded-xl bg-white p-5">
            <QRCodeCanvas
              value={did}
              size={200}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
              marginSize={1}
            />
          </div>

          {/* DID with copy */}
          <div className="flex w-full items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-3 py-2.5 font-mono text-xs text-text-secondary">
              {did}
            </code>
            <button
              type="button"
              onClick={async () => {
                const ok = await copyToClipboard(did);
                if (ok) {
                  setQrCopied(true);
                  setTimeout(() => setQrCopied(false), 2000);
                }
              }}
              className="shrink-0 rounded-lg bg-surface-2 p-2.5 text-text-tertiary hover:text-text-primary transition-colors"
              aria-label="Copy DID"
            >
              {qrCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <p className="text-xs text-text-ghost text-center">
            Scan this QR code or copy the DID to share this identity.
          </p>
        </div>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete Identity"
      >
        <p className="text-sm text-text-secondary">
          Are you sure you want to delete this identity? This action cannot be
          undone. All associated data, protocols, and permissions will be
          permanently removed.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDeleteOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            loading={deleteIdentity.isPending}
          >
            Delete Identity
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
