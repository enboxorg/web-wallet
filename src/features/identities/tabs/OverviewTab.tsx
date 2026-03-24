import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { useProfile } from '@/enbox/hooks/use-profile';
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
        description="Add a display name, avatar, and bio to personalize this identity."
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
    </div>
  );
}
