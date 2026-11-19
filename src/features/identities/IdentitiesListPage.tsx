import { useState, useMemo } from 'react';
import { Download, Users, UserPlus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { useProfile } from '@/enbox/hooks/use-profile';
import { IdentityCard } from '@/components/identity/IdentityCard';
import { IdentityCardSkeleton } from '@/components/identity/IdentityCardSkeleton';
import { buttonClassName } from '@/components/ui/button-styles';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';
import { countActivePermissionApps } from './tabs/permission-sessions';

const SEARCH_THRESHOLD = 3;

function IdentityCardWithProfile({ identity }: { identity: any }) {
  const did = identity.did.uri;
  const { data: profile, isLoading } = useProfile(did);
  const { data: permissions } = usePermissions(did);
  const navigate = useNavigate();
  const isProfileHydrating =
    isLoading ||
    profile?.hasProfileRecord === false ||
    (profile?.hasProfileRecord === true && profile.avatarUrl === undefined);

  // Count apps with live access, matching the profile's Apps & Permissions tab.
  const appCount = countActivePermissionApps(permissions);

  if (isProfileHydrating) {
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
      appCount={appCount}
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
    return <Loader message="Loading profiles…" />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-[length:var(--text-2xl)] font-semibold text-text-primary">
          Identities
        </h1>
        <ErrorBox message={`Couldn't load your profiles: ${(error as Error).message}`} />
      </div>
    );
  }

  const hasIdentities = identities !== undefined && identities.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profiles"
        description="The profiles you share with your apps."
        actions={
          <>
            <Link to="/identities/import" className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
              <Download size={16} />
              Import
            </Link>
            <Link to="/identities/create" className={buttonClassName({ size: 'sm' })}>
              <UserPlus size={16} />
              New profile
            </Link>
          </>
        }
      />

      {/* Searching only helps once there are a few profiles to tell apart. */}
      {hasIdentities && (identities.length > SEARCH_THRESHOLD || search !== '') && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-ghost pointer-events-none" />
          <Input
            placeholder="Search your profiles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {hasIdentities ? (
        filteredIdentities.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
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
            title="No profiles match your search"
            description="Try a different search term or clear the filter."
          />
        )
      ) : (
        <EmptyState
          icon={<Users />}
          title="No profiles yet"
          description="Create your first profile to get started."
          action={
            <Link to="/identities/create" className={buttonClassName()}>Create your first profile</Link>
          }
        />
      )}
    </div>
  );
}
