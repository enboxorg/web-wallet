import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Network, Plus, Users } from 'lucide-react';

import { useIdentities } from '@/enbox/hooks/use-identities';
import { useProfile } from '@/enbox/hooks/use-profile';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';
import SocialGraphTab from '@/features/identities/tabs/SocialGraphTab';
import { cn, truncateDid } from '@/lib/utils';

type WalletIdentity = {
  did: { uri: string };
  metadata?: { name?: string };
};

export default function SocialGraphPage() {
  const { data, isLoading, error } = useIdentities();
  const identities = useMemo(() => (data ?? []) as WalletIdentity[], [data]);
  const [selectedDid, setSelectedDid] = useState<string | null>(null);

  const selectedIdentity = useMemo(() => {
    if (identities.length === 0) return undefined;
    return identities.find((identity) => identity.did.uri === selectedDid) ?? identities[0];
  }, [identities, selectedDid]);

  if (isLoading) {
    return <Loader message="Loading social graph..." />;
  }

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Connections" />
        <ErrorBox message={`Failed to load profiles: ${(error as Error).message}`} />
      </div>
    );
  }

  if (identities.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Connections" />
        <EmptyState
          icon={<Users />}
          title="No profiles yet"
          description="Create a profile before adding connections."
          action={
            <Link to="/identities/create">
              <Button size="md">
                <Plus size={16} />
                New profile
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const activeDid = selectedIdentity?.did.uri;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Connections"
        description="Friends, groups, and blocked people across your profiles."
        actions={
          <Link to="/identities/create">
            <Button variant="secondary" size="sm">
              <Plus size={16} />
              New profile
            </Button>
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3" aria-label="Social graph profile">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-ghost">
            <Network className="h-3.5 w-3.5" />
            Identity
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
            {identities.map((identity) => {
              const did = identity.did.uri;
              return (
                <SocialIdentityOption
                  key={did}
                  identity={identity}
                  active={did === activeDid}
                  onSelect={() => setSelectedDid(did)}
                />
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          {selectedIdentity && <ActiveIdentityHeader identity={selectedIdentity} />}
          {activeDid && <SocialGraphTab did={activeDid} />}
        </main>
      </div>
    </div>
  );
}

function SocialIdentityOption({
  identity,
  active,
  onSelect,
}: {
  identity: WalletIdentity;
  active: boolean;
  onSelect: () => void;
}) {
  const did = identity.did.uri;
  const { data: profile, isLoading } = useProfile(did);
  const persona = identity.metadata?.name;
  const displayName = !isLoading && profile?.displayName
    ? profile.displayName
    : persona || 'Unnamed';

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'flex min-w-60 items-center gap-3 rounded-lg border p-3 text-left',
        'transition-colors duration-[var(--duration-fast)] lg:w-full lg:min-w-0',
        active
          ? 'border-accent bg-accent-muted'
          : 'border-border-default bg-surface-1 hover:border-border-strong hover:bg-surface-2',
      )}
    >
      <Avatar src={profile?.avatarUrl} name={displayName} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-primary">
          {displayName}
        </span>
        <span className="mt-0.5 block truncate font-mono text-xs text-text-tertiary">
          {truncateDid(did)}
        </span>
      </span>
    </button>
  );
}

function ActiveIdentityHeader({ identity }: { identity: WalletIdentity }) {
  const did = identity.did.uri;
  const { data: profile, isLoading } = useProfile(did);
  const persona = identity.metadata?.name;
  const displayName = !isLoading && profile?.displayName
    ? profile.displayName
    : persona || 'Unnamed';

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-surface-1 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={profile?.avatarUrl} name={displayName} size="md" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-semibold text-text-primary">
              {displayName}
            </h2>
            {persona && (
              <span className="shrink-0 rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-medium text-accent">
                {persona}
              </span>
            )}
          </div>
          <p className="truncate font-mono text-xs text-text-tertiary">
            {truncateDid(did)}
          </p>
        </div>
      </div>
      <Link to={`/identity/${encodeURIComponent(did)}`}>
        <Button variant="secondary" size="sm" className="w-full sm:w-auto">
          Open Details
        </Button>
      </Link>
    </div>
  );
}
