import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { Pencil, Download, Trash2, Copy, Check } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);

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

  const displayName = profile?.displayName || 'Unnamed';
  const persona = identity?.metadata?.name;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
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
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
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
          <Link to={`/identity/${encodeURIComponent(did)}/edit`}>
            <Button variant="secondary" size="sm">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exportIdentity.isPending}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <TabList>
        {TABS.map((label, index) => (
          <Tab
            key={label}
            active={activeTab === index}
            onClick={() => setActiveTab(index)}
          >
            {label}
          </Tab>
        ))}
      </TabList>

      <TabPanel active={activeTab === 0}>
        <OverviewTab did={did} />
      </TabPanel>
      <TabPanel active={activeTab === 1}>
        <ProtocolsTab did={did} />
      </TabPanel>
      <TabPanel active={activeTab === 2}>
        <WalletsTab did={did} />
      </TabPanel>
      <TabPanel active={activeTab === 3}>
        <PermissionsTab did={did} />
      </TabPanel>
      <TabPanel active={activeTab === 4}>
        <ActivityTab did={did} />
      </TabPanel>

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
