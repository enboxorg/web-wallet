import { Link } from 'react-router';
import { ExternalLink, QrCode, Search } from 'lucide-react';
import { useProfile } from '@/enbox/hooks/use-profile';
import { useProtocols } from '@/enbox/hooks/use-protocols';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';

interface OverviewTabProps {
  did: string;
}

export default function OverviewTab({ did }: OverviewTabProps) {
  const { data: profile, isLoading, isError, error } = useProfile(did);
  const { data: protocols } = useProtocols(did);
  const { data: permissions } = usePermissions(did);

  const protocolCount = protocols?.length ?? 0;
  const granteeCount = permissions
    ? new Set(permissions.map((p: any) => p.grantee)).size
    : 0;

  if (isLoading) {
    return <Loader message="Loading profile..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  if (!profile || !profile.displayName) {
    return (
      <EmptyState
        icon={<ExternalLink />}
        title="Set up your profile"
        description="Add a display name, avatar, and bio to personalize this profile."
        action={
          <Link
            to={`/identity/${encodeURIComponent(did)}/edit`}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-accent-text hover:bg-accent-hover transition-colors"
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
        <div className="h-40 rounded-lg bg-gradient-to-br from-accent/30 via-accent/10 to-surface-2" />
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
        <Card padding="sm">
          <p className="text-sm leading-relaxed text-text-secondary">
            {profile.bio}
          </p>
        </Card>
      )}

      {/* Quick stats */}
      {profile?.displayName && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border-default bg-surface-1 p-3 text-center">
            <p className="text-xl font-semibold text-text-primary">{protocolCount}</p>
            <p className="text-xs text-text-tertiary mt-0.5">Protocols</p>
          </div>
          <div className="rounded-lg border border-border-default bg-surface-1 p-3 text-center">
            <p className="text-xl font-semibold text-text-primary">{granteeCount}</p>
            <p className="text-xs text-text-tertiary mt-0.5">Apps</p>
          </div>
          <div className="rounded-lg border border-border-default bg-surface-1 p-3 text-center">
            <p className="text-xl font-semibold text-accent">Active</p>
            <p className="text-xs text-text-tertiary mt-0.5">Status</p>
          </div>
        </div>
      )}

      {/* Quick action links */}
      {profile?.displayName && (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/connect/app"
            className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-1 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            <QrCode size={16} />
            Connect App
          </Link>
          <Link
            to="/search"
            className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-1 px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            <Search size={16} />
            Find people
          </Link>
        </div>
      )}
    </div>
  );
}
