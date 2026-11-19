import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, Pencil, Download, Trash2, Copy, Check, QrCode, UserX, Share2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import { useModules } from '@/enbox/hooks/use-modules';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import {
  useDeleteIdentity,
  useExportIdentity,
} from '@/enbox/hooks/use-identity-mutations';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { buttonClassName } from '@/components/ui/button-styles';
import { Dialog } from '@/components/ui/Dialog';
import { Loader } from '@/components/ui/Loader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { TabList, Tab, TabPanel } from '@/components/ui/Tabs';
import { runEnboxPromise } from '@/enbox/effect/runtime';
import { shareEffect } from '@/lib/browser-effects';
import { truncateDid, copyToClipboard, sameName } from '@/lib/utils';

import OverviewTab from './tabs/OverviewTab';
import ModulesTab from './tabs/ModulesTab';
import WalletsTab from './tabs/WalletsTab';
import PermissionsTab from './tabs/PermissionsTab';
import ActivityTab from './tabs/ActivityTab';
import { countActivePermissionApps } from './tabs/permission-sessions';

const TABS = ['Overview', 'Modules', 'Wallets', 'Apps & Permissions', 'Activity'] as const;
const tabId = (i: number) => `identity-tab-${i}`;
const panelId = (i: number) => `identity-panel-${i}`;

export default function IdentityDetailsPage() {
  const { did: rawDid } = useParams<{ did: string }>();
  const did = rawDid ? decodeURIComponent(rawDid) : '';
  const navigate = useNavigate();

  const { data: identities, isLoading: identitiesLoading } = useIdentities();
  const { data: profile, isLoading: profileLoading } = useProfile(did);
  const { data: modules } = useModules(did);
  const { data: permissions } = usePermissions(did);
  const deleteIdentity = useDeleteIdentity();
  const exportIdentity = useExportIdentity();

  const tabCounts = useMemo<Array<number | undefined>>(() => [
    undefined,
    modules?.length ?? 0,
    undefined,
    countActivePermissionApps(permissions),
    undefined,
  ], [modules, permissions]);

  const identity = useMemo(
    () => identities?.find((id: any) => id.did.uri === did),
    [identities, did],
  );

  const [activeTab, setActiveTab] = useState(0);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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
      toast.success('Profile exported');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to export profile',
      );
    }
  }

  async function handleDelete() {
    try {
      await deleteIdentity.mutateAsync(did);
      toast.success('Profile deleted');
      navigate('/');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to delete profile',
      );
    }
  }

  if (identitiesLoading || profileLoading) {
    return <Loader message="Loading profile..." />;
  }

  if (!identity && !identitiesLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <UserX size={48} className="text-text-ghost" />
        <h1 className="text-xl font-semibold text-text-primary">Profile not found</h1>
        <p className="text-sm text-text-secondary">
          This identity may have been deleted or the DID is invalid.
        </p>
        <Link to="/" className={buttonClassName()}>Go to profiles</Link>
      </div>
    );
  }

  const displayName = profile?.displayName || 'Unnamed';
  const persona = identity?.metadata?.name;

  return (
    <div className="space-y-6">
      {/* Back link — mobile/tablet only; the sidebar handles this on desktop */}
      <Link
        to="/"
        className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm text-text-tertiary transition-colors hover:text-text-primary lg:hidden"
        aria-label="Back to profiles"
      >
        <ArrowLeft className="size-4" />
        Profiles
      </Link>

      {/* Profile header */}
      <header className="overflow-hidden rounded-2xl border border-border-default bg-surface-1">
        {profile?.heroUrl ? (
          <div
            className="h-28 bg-cover bg-center sm:h-36"
            style={{ backgroundImage: `url(${profile.heroUrl})` }}
          />
        ) : (
          <div className="h-28 bg-[radial-gradient(120%_140%_at_0%_0%,rgba(var(--accent-rgb),0.35),transparent_55%),radial-gradient(120%_140%_at_100%_100%,rgba(var(--accent-rgb),0.12),transparent_60%)] bg-surface-2 sm:h-36" />
        )}

        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-12 flex items-end justify-between gap-3">
            <Avatar
              src={profile?.avatarUrl}
              name={displayName}
              size="xl"
              className="ring-4 ring-surface-1"
            />

            {/* Everyday actions; export and delete live under Manage profile. */}
            <div className="flex items-center gap-2 pb-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setQrOpen(true)}
              >
                <QrCode className="size-3.5" />
                Share
              </Button>
              <Link
                to={`/identity/${encodeURIComponent(did)}/edit`}
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
              >
                <Pencil className="size-3.5" />
                Edit
              </Link>
            </div>
          </div>

          <div className="mt-3 min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-text-primary">
                {displayName}
              </h1>
              {persona && !sameName(persona, displayName) && (
                <Badge tone="accent" size="md" title="Persona: only you see this">{persona}</Badge>
              )}
            </div>
            {profile?.tagline && (
              <p className="mt-1 text-sm text-text-secondary">{profile.tagline}</p>
            )}
            <button
              type="button"
              onClick={handleCopyDid}
              className="mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-xs text-text-tertiary transition-colors hover:bg-surface-3 hover:text-text-primary"
              title="Copy profile ID"
            >
              <span className="truncate">{truncateDid(did)}</span>
              {copied ? (
                <Check className="size-3.5 shrink-0 text-success" />
              ) : (
                <Copy className="size-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <TabList>
        {TABS.map((label, index) => (
          <Tab
            key={label}
            id={tabId(index)}
            panelId={panelId(index)}
            active={activeTab === index}
            onClick={() => setActiveTab(index)}
            count={tabCounts[index]}
          >
            {label}
          </Tab>
        ))}
      </TabList>

      <TabPanel id={panelId(0)} labelledBy={tabId(0)} active={activeTab === 0}>
        <div className="space-y-8">
          <OverviewTab did={did} />

          <section aria-labelledby="manage-profile-heading" className="space-y-3">
            <SectionHeader id="manage-profile-heading" title="Manage profile" />
            <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-default bg-surface-1">
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">Export profile</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    Download this profile and its keys as a backup file. Keep the file private.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="shrink-0 self-start sm:self-auto"
                  onClick={handleExport}
                  loading={exportIdentity.isPending}
                >
                  {!exportIdentity.isPending && <Download className="size-3.5" />}
                  Export
                </Button>
              </div>
              <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">Delete profile</p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    Permanently remove this profile and its data from your wallet.
                  </p>
                </div>
                <Button
                  variant="danger-soft"
                  size="sm"
                  className="shrink-0 self-start sm:self-auto"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          </section>
        </div>
      </TabPanel>
      <TabPanel id={panelId(1)} labelledBy={tabId(1)} active={activeTab === 1}>
        <ModulesTab did={did} />
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
        title="Share profile"
      >
        <div className="flex flex-col items-center gap-5">
          {/* QR code on white background for scan visibility in any theme */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
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
              aria-label="Copy profile ID"
            >
              {qrCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={async () => {
              const url = `${window.location.origin}/search/${encodeURIComponent(did)}`;
              const ok = await copyToClipboard(url);
              if (ok) {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              }
            }}
            className="text-xs text-text-tertiary hover:text-accent transition-colors"
          >
            {linkCopied ? 'Link copied!' : 'Copy profile link'}
          </button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={async () => {
                await runEnboxPromise(shareEffect({
                  title: profile?.displayName || 'Enbox profile',
                  text: did,
                  url: `${window.location.origin}/search/${encodeURIComponent(did)}`,
                }));
              }}
            >
              <Share2 size={14} />
              Share
            </Button>
          )}

          <p className="text-xs text-text-ghost text-center">
            Scan this QR code or copy the ID to share this profile.
          </p>
        </div>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}
        title="Delete profile"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            This will permanently delete this profile and all its data.
            This action <strong className="text-text-primary">cannot be undone</strong>.
          </p>
          <div>
            <label className="text-xs text-text-tertiary">
              Type <strong className="text-text-primary font-mono">DELETE</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="mt-1.5 w-full min-h-11 rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-text-primary border border-border-default focus:border-error focus:outline-none focus:ring-4 focus:ring-error/15 font-mono"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => { setDeleteOpen(false); setDeleteConfirmText(''); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              loading={deleteIdentity.isPending}
              disabled={deleteConfirmText !== 'DELETE'}
            >
              Delete profile
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
