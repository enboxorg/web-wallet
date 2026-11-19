import { useState, useMemo } from 'react';
import { Download, Plus, Users, UserPlus, Search } from 'lucide-react';
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
        <h1 className="text-[1.75rem] font-semibold leading-9 tracking-[-0.025em] text-text-primary sm:text-[2rem] sm:leading-10">
          Profiles
        </h1>
        <ErrorBox message={`Couldn't load your profiles: ${(error as Error).message}`} />
      </div>
    );
  }

  const hasIdentities = identities !== undefined && identities.length > 0;

  return (
    <div className="space-y-7">
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
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search your profiles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-11"
          />
        </div>
      )}

      {hasIdentities ? (
        filteredIdentities.length > 0 ? (
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
            {filteredIdentities.map((identity: any) => (
              <IdentityCardWithProfile
                key={identity.did.uri}
                identity={identity}
              />
            ))}
            {/* An open seat at the end of the row: one more way in to creating a profile. */}
            {search === '' && (
              <Link
                to="/identities/create"
                aria-label="Add a profile"
                className="group flex min-h-48 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border-strong p-6 text-center transition-[border-color,background-color] duration-[var(--duration-base)] hover:border-accent/60 hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-border-default bg-surface-2 text-text-secondary transition-colors group-hover:border-accent/40 group-hover:bg-accent-muted group-hover:text-accent">
                  <Plus className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-text-primary">Add a profile</span>
                  <span className="mt-0.5 block text-xs text-text-tertiary">Keep work, play and personal apart</span>
                </span>
              </Link>
            )}
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
