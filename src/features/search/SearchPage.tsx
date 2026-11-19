import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Search, AlertCircle, History, UserCheck } from 'lucide-react';

import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { PageHeader } from '@/components/ui/PageHeader';
import { PublicIdentityCard } from '@/components/identity/PublicIdentityCard';
import { useBlobUrl } from '@/enbox/hooks/use-blob-url';
import { truncateDid } from '@/lib/utils';
import { usePublicProfile } from './public-profile';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageGetEffect, localStorageSetEffect } from '@/lib/browser-effects';

const SEARCH_HISTORY_KEY = 'enbox:searchHistory';
const MAX_HISTORY = 5;
const URL_RELEASE_DELAY_MS = 60_000;

function getSearchHistory(): string[] {
  try {
    const raw = runEnboxSync(localStorageGetEffect(SEARCH_HISTORY_KEY));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addToSearchHistory(did: string): void {
  try {
    const history = getSearchHistory().filter(d => d !== did);
    history.unshift(did);
    runEnboxSync(localStorageSetEffect(
      SEARCH_HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY)),
    ));
  } catch {}
}

export default function SearchPage() {
  const { did: routeDid } = useParams<{ did: string }>();
  const navigate = useNavigate();

  const [didInput, setDidInput] = useState(routeDid ?? '');
  const [searchDid, setSearchDid] = useState(routeDid ?? '');
  const [searchHistory, setSearchHistory] = useState<string[]>(() => getSearchHistory());
  const canSearch = searchDid.startsWith('did:');

  // Pre-fill from route param changes
  useEffect(() => {
    if (routeDid) {
      setDidInput(routeDid);
      setSearchDid(routeDid);
    }
  }, [routeDid]);

  const {
    data: profile,
    isLoading,
    isError,
    error,
  } = usePublicProfile(searchDid, canSearch);
  const avatarUrl = useBlobUrl(profile?.avatar, URL_RELEASE_DELAY_MS);
  const heroUrl = useBlobUrl(profile?.hero, URL_RELEASE_DELAY_MS);

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
    <div className="mx-auto max-w-3xl space-y-7">
      <PageHeader
        title="Find people"
        description="Look up someone's public profile with their profile ID. They can copy it from Share on their profile."
      />

      {/* Search form */}
      <form onSubmit={handleSearch} className="flex gap-2.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden="true" />
          <Input
            aria-label="Profile ID"
            placeholder="Paste a profile ID (did:…)"
            value={didInput}
            onChange={(e) => setDidInput(e.target.value)}
            className="pl-11 font-mono text-[13px] placeholder:font-sans placeholder:text-sm"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" disabled={!didInput.trim().startsWith('did:')}>
          Search
        </Button>
      </form>

      {/* Recent searches */}
      {!searchDid && searchHistory.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="eyebrow px-1">Recent</h3>
          <div className="flex flex-wrap gap-2">
            {searchHistory.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { setDidInput(d); setSearchDid(d); }}
                className="btn-raised inline-flex min-h-9 max-w-[240px] items-center gap-2 rounded-full border border-border-default bg-surface-2 px-3.5 font-mono text-xs text-text-secondary transition-colors hover:border-border-strong hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <History className="size-3.5 shrink-0 text-text-ghost" aria-hidden="true" />
                <span className="truncate">{truncateDid(d)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && <Loader message="Looking them up..." />}

      {/* Error */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-error/30 bg-error/[0.07] px-6 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-error/10 text-error ring-1 ring-inset ring-error/20">
            <AlertCircle className="size-6" aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-error">
            {(error as Error)?.message ?? "We couldn't find that ID. It may be mistyped or unreachable."}
          </p>
        </div>
      )}

      {/* Result */}
      {profile && !isLoading && !isError && (
        <div>
          <h2 className="eyebrow mb-3 px-1">Result</h2>
          {profile.displayName ? (
            <PublicIdentityCard
              did={profile.did}
              displayName={profile.displayName}
              tagline={profile.tagline}
              bio={profile.bio}
              avatarUrl={avatarUrl}
              heroUrl={heroUrl}
            />
          ) : (
            <div className="surface-card flex flex-col items-center gap-4 rounded-3xl border border-border-default bg-surface-1 px-6 py-10 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success ring-1 ring-inset ring-success/20">
                <UserCheck className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-semibold tracking-tight text-text-primary">Found them</p>
                <p className="mt-1 text-sm text-text-tertiary">
                  This profile ID exists, but there's no public profile for it yet.
                </p>
                <p className="mt-3 break-all font-mono text-xs text-text-ghost">
                  {profile.did}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && !isLoading && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-border-strong px-6 py-14 text-center">
          <span className="surface-card flex size-16 items-center justify-center rounded-[20px] border border-border-default bg-surface-2 text-text-secondary">
            <Search className="size-7" aria-hidden="true" />
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-text-tertiary">
            Paste a profile ID above to see that person's public profile. IDs start with <span className="font-mono text-text-secondary">did:</span>
          </p>
        </div>
      )}
    </div>
  );
}
