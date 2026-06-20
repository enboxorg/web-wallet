import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, AlertCircle, UserCheck } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicIdentityCard } from '@/components/identity/PublicIdentityCard';
import { queryKeys } from '@/enbox/queries/query-keys';
import { truncateDid } from '@/lib/utils';
import type { IdentityProfile } from '@/enbox/types';
import { fetchPublicProfile } from './public-profile';

const SEARCH_HISTORY_KEY = 'enbox:searchHistory';
const MAX_HISTORY = 5;

function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addToSearchHistory(did: string): void {
  try {
    const history = getSearchHistory().filter(d => d !== did);
    history.unshift(did);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch {}
}

export default function SearchPage() {
  const { did: routeDid } = useParams<{ did: string }>();
  const navigate = useNavigate();

  const [didInput, setDidInput] = useState(routeDid ?? '');
  const [searchDid, setSearchDid] = useState(routeDid ?? '');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
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

  // Track successful searches in history
  useEffect(() => {
    if (profile && searchDid) {
      addToSearchHistory(searchDid);
      setSearchHistory(getSearchHistory());
    }
  }, [profile, searchDid]);

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

      {/* Recent searches */}
      {!searchDid && searchHistory.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-text-ghost uppercase tracking-wider">Recent</h3>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDidInput(d); setSearchDid(d); }}
                className="rounded-full bg-surface-2 px-3 py-1.5 font-mono text-xs text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors truncate max-w-[200px]"
              >
                {truncateDid(d)}
              </button>
            ))}
          </div>
        </div>
      )}

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
