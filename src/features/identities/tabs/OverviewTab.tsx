import { useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Copy, Check } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useProfile } from '@/enbox/hooks/use-profile';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { copyToClipboard } from '@/lib/utils';

interface OverviewTabProps {
  did: string;
}

export default function OverviewTab({ did }: OverviewTabProps) {
  const { data: profile, isLoading } = useProfile(did);

  if (isLoading) {
    return <Loader message="Loading profile..." />;
  }

  if (!profile || !profile.displayName) {
    return (
      <EmptyState
        icon={<ExternalLink />}
        title="Set up your profile"
        description="Add a display name, avatar, and bio to personalize this identity."
        action={
          <Link
            to={`/identity/${encodeURIComponent(did)}/edit`}
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Edit Profile
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      {profile.heroUrl ? (
        <div
          className="h-40 rounded-lg bg-cover bg-center"
          style={{ backgroundImage: `url(${profile.heroUrl})` }}
        />
      ) : (
        <div className="h-40 rounded-lg bg-gradient-to-r from-accent/20 to-accent/5" />
      )}

      {/* Avatar + name */}
      <div className="-mt-14 ml-6 flex items-end gap-4">
        <Avatar
          src={profile.avatarUrl}
          name={profile.displayName}
          size="xl"
          className="ring-4 ring-surface-0"
        />
        <div className="pb-1">
          <h2 className="text-xl font-semibold text-text-primary">
            {profile.displayName}
          </h2>
          {profile.tagline && (
            <p className="text-sm text-text-secondary">{profile.tagline}</p>
          )}
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4">
          <p className="text-sm leading-relaxed text-text-secondary">
            {profile.bio}
          </p>
        </div>
      )}

      {/* Share DID */}
      <ShareDid did={did} />
    </div>
  );
}

function ShareDid({ did }: { did: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(did);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-text-secondary">Share DID</h3>
      <div className="flex flex-col items-center gap-4 rounded-lg bg-surface-2 p-6">
        <QRCodeCanvas
          value={did}
          size={160}
          className="sm:!h-[200px] sm:!w-[200px]"
          bgColor="transparent"
          fgColor="currentColor"
        />
        <div className="flex w-full items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-surface-1 px-3 py-2 font-mono text-xs text-text-secondary">
            {did}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md bg-surface-1 p-2 text-text-tertiary hover:text-text-primary transition-colors"
            aria-label="Copy DID"
          >
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
