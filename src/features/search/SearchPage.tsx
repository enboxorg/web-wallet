import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, AlertCircle, UserCheck } from 'lucide-react';
import { Enbox } from '@enbox/api';
import { ProfileDefinition } from '@enbox/protocols';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicIdentityCard } from '@/components/identity/PublicIdentityCard';
import { queryKeys } from '@/enbox/queries/query-keys';
import type { IdentityProfile } from '@/enbox/types';

/** Lazily-created anonymous Enbox instance for reading public DWN data. */
let _anonApi: ReturnType<typeof Enbox.anonymous> | undefined;
function getAnonymousApi() {
  if (!_anonApi) _anonApi = Enbox.anonymous();
  return _anonApi;
}

/** Fetch a public profile via anonymous DWN reads. */
async function fetchPublicProfile(did: string): Promise<IdentityProfile> {
  const { dwn } = getAnonymousApi();

  let displayName = '';
  let tagline: string | undefined;
  let bio: string | undefined;
  let avatarUrl: string | undefined;
  let heroUrl: string | undefined;

  // Fetch profile social data
  const { records: profileRecords } = await dwn.records.query({
    from: did,
    filter: {
      protocol: ProfileDefinition.protocol,
      protocolPath: 'profile',
    },
  });

  if (profileRecords.length > 0) {
    const social = await profileRecords[0].data.json() as Record<string, string | undefined>;
    displayName = social.displayName ?? '';
    tagline = social.tagline;
    bio = social.bio;
  }

  // Fetch avatar
  try {
    const { records: avatarRecords } = await dwn.records.query({
      from: did,
      filter: {
        protocol: ProfileDefinition.protocol,
        protocolPath: 'profile/avatar',
      },
    });
    if (avatarRecords.length > 0) {
      const blob: Blob = await avatarRecords[0].data.blob();
      avatarUrl = URL.createObjectURL(blob);
    }
  } catch {
    // Avatar not available
  }

  // Fetch hero
  try {
    const { records: heroRecords } = await dwn.records.query({
      from: did,
      filter: {
        protocol: ProfileDefinition.protocol,
        protocolPath: 'profile/hero',
      },
    });
    if (heroRecords.length > 0) {
      const blob: Blob = await heroRecords[0].data.blob();
      heroUrl = URL.createObjectURL(blob);
    }
  } catch {
    // Hero not available
  }

  return { did, displayName, tagline, bio, avatarUrl, heroUrl };
}

export default function SearchPage() {
  const { did: routeDid } = useParams<{ did: string }>();
  const navigate = useNavigate();

  const [didInput, setDidInput] = useState(routeDid ?? '');
  const [searchDid, setSearchDid] = useState(routeDid ?? '');
  const prevProfileRef = useRef<IdentityProfile | null>(null);

  // Pre-fill from route param changes
  useEffect(() => {
    if (routeDid) {
      setDidInput(routeDid);
      setSearchDid(routeDid);
    }
  }, [routeDid]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (prevProfileRef.current?.avatarUrl) URL.revokeObjectURL(prevProfileRef.current.avatarUrl);
      if (prevProfileRef.current?.heroUrl) URL.revokeObjectURL(prevProfileRef.current.heroUrl);
    };
  }, []);

  const {
    data: profile,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.didLookup(searchDid),
    queryFn: async () => {
      // Revoke previous blob URLs
      if (prevProfileRef.current?.avatarUrl) URL.revokeObjectURL(prevProfileRef.current.avatarUrl);
      if (prevProfileRef.current?.heroUrl) URL.revokeObjectURL(prevProfileRef.current.heroUrl);

      const result = await fetchPublicProfile(searchDid);
      prevProfileRef.current = result;
      return result;
    },
    enabled: searchDid.startsWith('did:'),
    retry: false,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = didInput.trim();
    if (!trimmed || !trimmed.startsWith('did:')) return;

    setSearchDid(trimmed);
    navigate(`/search/${encodeURIComponent(trimmed)}`, { replace: true });
  }

  const showEmpty = !searchDid || !searchDid.startsWith('did:');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Search DIDs"
        description="Look up a DID to view their public profile."
      />

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="flex-1">
          <Input
            placeholder="Enter a DID (e.g. did:dht:...)"
            value={didInput}
            onChange={(e) => setDidInput(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!didInput.trim().startsWith('did:')}>
          <Search className="h-4 w-4" />
          Search
        </Button>
      </form>

      {/* Loading */}
      {isLoading && <Loader message="Looking up DID..." />}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-error/30 bg-error/5 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-error" />
          <p className="text-sm text-error">
            {(error as Error)?.message ?? 'Could not resolve DID. It may be invalid or unreachable.'}
          </p>
        </div>
      )}

      {/* Result */}
      {profile && !isLoading && !isError && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-text-secondary">Result</h2>
          {profile.displayName ? (
            <PublicIdentityCard
              did={profile.did}
              displayName={profile.displayName}
              tagline={profile.tagline}
              bio={profile.bio}
              avatarUrl={profile.avatarUrl}
              heroUrl={profile.heroUrl}
            />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border-default bg-surface-1 p-8 text-center">
              <UserCheck className="h-10 w-10 text-text-ghost" />
              <div>
                <p className="text-sm font-medium text-text-primary">DID resolved</p>
                <p className="mt-1 text-xs text-text-tertiary">
                  This DID exists but has no public profile.
                </p>
                <p className="mt-2 font-mono text-xs text-text-ghost break-all">
                  {profile.did}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border-default bg-surface-1 p-12 text-center">
          <Search className="h-12 w-12 text-text-ghost" />
          <p className="text-sm text-text-tertiary">
            Enter a valid DID above to search for public profiles
          </p>
        </div>
      )}
    </div>
  );
}
