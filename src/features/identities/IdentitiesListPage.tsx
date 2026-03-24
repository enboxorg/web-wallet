import { useState, useMemo } from 'react';
import { Users, UserPlus, Plus, Search } from 'lucide-react';
import { useNavigate, Link } from 'react-router';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import { IdentityCard } from '@/components/identity/IdentityCard';
import { IdentityCardSkeleton } from '@/components/identity/IdentityCardSkeleton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';

function IdentityCardWithProfile({ identity }: { identity: any }) {
  const did = identity.did.uri;
  const { data: profile, isLoading } = useProfile(did);
  const navigate = useNavigate();

  if (isLoading) {
    return <IdentityCardSkeleton />;
  }

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
  const [search, setSearch] = useState('');

  const filteredIdentities = useMemo(() => {
    if (!identities) return [];
    const term = search.trim().toLowerCase();
    if (!term) return identities;

    return identities.filter((identity: any) => {
      const did: string = identity.did.uri ?? '';
      const persona: string = identity.metadata.name ?? '';
      // Profile data isn't available here (it's fetched per-card),
      // so we filter on identity-level fields only.
      return (
        did.toLowerCase().includes(term) ||
        persona.toLowerCase().includes(term)
      );
    });
  }, [identities, search]);

  if (isLoading) {
    return <Loader message="Loading identities…" />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-[length:var(--text-2xl)] font-semibold text-text-primary">
          Identities
        </h1>
        <ErrorBox message={`Failed to load identities: ${(error as Error).message}`} />
      </div>
    );
  }

  const hasIdentities = identities && identities.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Identities"
        description="Manage your decentralised identities."
        actions={
          <Link to="/identities/create">
            <Button size="sm">
              <UserPlus size={16} />
              Create Identity
            </Button>
          </Link>
        }
      />

      {hasIdentities && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-ghost pointer-events-none" />
          <Input
            placeholder="Search by name, persona, or DID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {hasIdentities ? (
        filteredIdentities.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIdentities.map((identity: any) => (
              <IdentityCardWithProfile
                key={identity.did.uri}
                identity={identity}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Search />}
            title="No identities match your search"
            description="Try a different search term or clear the filter."
          />
        )
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
