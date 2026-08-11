/**
 * TanStack Query key factory.
 *
 * All keys are readonly tuples so that `queryClient.invalidateQueries`
 * can match by prefix (e.g. invalidating `identities.all` also
 * invalidates every identity sub-key).
 */

export const queryKeys = {
  identities: {
    all: ['identities'] as const,
    profile: (did: string) => ['identities', did, 'profile'] as const,
    protocols: (did: string) => ['identities', did, 'protocols'] as const,
    permissions: (did: string) => ['identities', did, 'permissions'] as const,
    activity: (did: string) => ['identities', did, 'activity'] as const,
    dwnEndpoints: (did: string) => ['identities', did, 'dwnEndpoints'] as const,
    syncStatus: (did: string) => ['identities', did, 'syncStatus'] as const,
  },

  /** Resolve a DID document for an arbitrary DID (not necessarily ours). */
  didLookup: (did: string) => ['didLookup', did] as const,
};
