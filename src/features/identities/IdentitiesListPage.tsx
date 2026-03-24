import { Users, Plus } from 'lucide-react';
import { useNavigate, Link } from 'react-router';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import { IdentityCard } from '@/components/identity/IdentityCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Loader } from '@/components/ui/Loader';

function IdentityCardWithProfile({ identity }: { identity: any }) {
  const did = identity.did.uri;
  const { data: profile } = useProfile(did);
  const navigate = useNavigate();

  return (
    <IdentityCard
      did={did}
      displayName={profile?.displayName}
      tagline={profile?.tagline}
      avatarUrl={profile?.avatarUrl}
      heroUrl={profile?.heroUrl}
      persona={identity.metadata.name}
      onClick={() => navigate(`/identity/${encodeURIComponent(did)}`)}
    />
  );
}

export default function IdentitiesListPage() {
  const { data: identities, isLoading, error } = useIdentities();

  if (isLoading) {
    return <Loader message="Loading identities…" />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-[length:var(--text-2xl)] font-semibold text-text-primary">
          Identities
        </h1>
        <div className="rounded-lg border border-error/30 bg-error/5 p-6 text-center">
          <p className="text-sm text-error">
            Failed to load identities: {(error as Error).message}
          </p>
        </div>
      </div>
    );
  }

  const hasIdentities = identities && identities.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[length:var(--text-2xl)] font-semibold text-text-primary">
            Identities
          </h1>
          <p className="mt-2 text-text-secondary">
            Manage your decentralised identities.
          </p>
        </div>
        <Link to="/identities/create">
          <Button size="md">
            <Plus className="h-4 w-4" />
            Create Identity
          </Button>
        </Link>
      </div>

      {hasIdentities ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {identities.map((identity: any) => (
            <IdentityCardWithProfile
              key={identity.did.uri}
              identity={identity}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users />}
          title="No identities yet"
          description="Create your first decentralised identity to get started."
          action={
            <Link to="/identities/create">
              <Button size="md">Create your first identity</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
