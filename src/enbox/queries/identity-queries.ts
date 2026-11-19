/**
 * Query functions for fetching identity-related data from the Enbox SDK.
 *
 * These are **pure async functions** — not hooks — so they can be used
 * directly inside TanStack Query `queryFn` callbacks.
 */

import type { MaterializedRecord } from '@enbox/browser';

import { Effect } from 'effect';
import { ProfileModule } from '@enbox/modules';
import { DwnDateSort } from '@enbox/agent';

import type { EnboxAgent, IdentityProfileData, IdentityProfileImage } from '../types';
import { sdkError } from '../effect/errors';
import { withEnboxEffect } from '../effect/enbox-effect';
import { CurrentAgent, currentAgentLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';
import { isSessionRevocationGrant } from '@/features/identities/tabs/permission-sessions';

const PROFILE_MATERIALIZATION = {
  children: ['profile/avatar', 'profile/hero'],
} as const;

function profileImageData(
  image: MaterializedRecord<Blob> | undefined,
): IdentityProfileImage | undefined {
  if (image === undefined) {
    return undefined;
  }

  return {
    blob : image.value,
    key  : image.record.dataCid ?? `${image.record.id}|${image.record.timestamp}`,
  };
}

// ── Identity list ──────────────────────────────────────────────────

/** List all identities managed by the agent. Returns `BearerIdentity[]`. */
export async function fetchIdentities(agent: EnboxAgent) {
  return runEnboxPromise(
    fetchIdentitiesEffect().pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchIdentitiesEffect() {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => agent.identity.list(),
      catch: sdkError('identity.list'),
    });
  });
}

// ── Profile ────────────────────────────────────────────────────────

/** Resolve the full profile and raw image data for a DID. */
export async function fetchProfile(
  agent: EnboxAgent,
  did: string,
): Promise<IdentityProfileData> {
  return runEnboxPromise(
    fetchProfileEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchProfileEffect(did: string) {
  return withEnboxEffect(did, (enbox) => Effect.gen(function* () {
    const profileApi = enbox.using(ProfileModule);

    const profile = yield* Effect.tryPromise({
      try: async () => (await profileApi.records.query('profile', {
        materialize : PROFILE_MATERIALIZATION,
        pagination  : { limit: 1 },
      })).records[0],
      catch: sdkError('profile.get'),
    });
    const hasProfileRecord = profile !== undefined;
    const socialData = profile?.value ?? { displayName: '' };

    return {
      did,
      displayName: socialData.displayName,
      tagline: socialData.tagline,
      bio: socialData.bio,
      avatar: profileImageData(profile?.children.avatar),
      hero: profileImageData(profile?.children.hero),
      hasProfileRecord,
    };
  }));
}

// ── Modules ──────────────────────────────────────────────────────

/** Installed module definitions for the given DID. */
export async function fetchModules(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    fetchModulesEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

type QueriedModule = {
  definition: { module: string; published?: boolean };
  toJSON?: () => { descriptor?: { messageTimestamp?: string } };
};

/**
 * One entry per module URI. A module can have several configure messages
 * (installs, upgrades, synced copies); only its newest configuration counts.
 */
export function latestModulePerUri<T extends QueriedModule>(modules: readonly T[]): T[] {
  const timestamp = (module: T) => module.toJSON?.().descriptor?.messageTimestamp ?? '';
  const byUri = new Map<string, T>();
  for (const module of modules) {
    const current = byUri.get(module.definition.module);
    if (current === undefined || timestamp(module) >= timestamp(current)) {
      byUri.set(module.definition.module, module);
    }
  }
  return [...byUri.values()];
}

export function fetchModulesEffect(did: string) {
  return withEnboxEffect(did, (enbox) => Effect.gen(function* () {
    const { modules } = yield* Effect.tryPromise({
      try: async () => enbox.dwn.modules.query({}),
      catch: sdkError('modules.query'),
    });
    return latestModulePerUri(modules).map((p) => ({
      uri: p.definition.module as string,
      published: (p.definition.published ?? false) as boolean,
      definition: p.definition,
    }));
  }));
}

// ── Permissions ────────────────────────────────────────────────────

/** Permission grants stored in the DWN for the given DID. */
export async function fetchPermissions(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    fetchPermissionsEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchPermissionsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => {
        const entries = await agent.permissions.fetchGrants({
          author       : did,
          target       : did,
          checkRevoked : true,
        });
        return entries
          .map(({ grant }) => grant)
          .filter((grant) => !isSessionRevocationGrant(grant));
      },
      catch: sdkError('permissions.fetchGrants'),
    });
  });
}

/** Permission grant history, including grants that have been revoked. */
export async function fetchPermissionHistory(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    fetchPermissionHistoryEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchPermissionHistoryEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => {
        const entries = await agent.permissions.fetchGrants({
          author       : did,
          target       : did,
          checkRevoked : false,
        });
        return entries
          .map(({ grant }) => grant)
          .filter((grant) => !isSessionRevocationGrant(grant));
      },
      catch: sdkError('permissions.fetchGrantHistory'),
    });
  });
}

// ── DWN endpoints ──────────────────────────────────────────────────

/** Resolve the DWN service endpoint URLs from the DID document. */
export async function fetchDwnEndpoints(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    fetchDwnEndpointsEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchDwnEndpointsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async () => agent.identity.getDwnEndpoints({ didUri: did }),
      catch: sdkError('identity.getDwnEndpoints'),
    });
  });
}

// ── Activity ───────────────────────────────────────────────────────

export interface ActivityRecord {
  id: string;
  module?: string;
  modulePath?: string;
  schema?: string;
  dataFormat?: string;
  dateCreated: string;
  author: string;
  published?: boolean;
}

/** Recent records sorted newest-first. */
export async function fetchActivity(
  agent: EnboxAgent,
  did: string,
  limit = 50,
): Promise<ActivityRecord[]> {
  return runEnboxPromise(
    fetchActivityEffect(did, limit).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchActivityEffect(did: string, limit = 50) {
  return withEnboxEffect(did, (enbox) => Effect.gen(function* () {
    // A records query needs at least one filter property, so recent records
    // are read per installed module and merged newest-first.
    const { modules } = yield* Effect.tryPromise({
      try: async () => enbox.dwn.modules.query({}),
      catch: sdkError('modules.query.activity'),
    });
    const moduleUris = latestModulePerUri(modules).map((module) => module.definition.module as string);
    const perModule = yield* Effect.forEach(moduleUris, (module) => Effect.tryPromise({
      try: async () =>
        enbox.dwn.records.query({
          filter: { module },
          dateSort: DwnDateSort.CreatedDescending,
          pagination: { limit },
        }),
      catch: sdkError('records.query.activity'),
    }), { concurrency: 4 });

    const records = perModule
      .flatMap((result) => result.records)
      .sort((left, right) => right.dateCreated.localeCompare(left.dateCreated))
      .slice(0, limit);

    return records.map((r) => ({
      id: r.id,
      module: r.module,
      modulePath: r.modulePath,
      schema: r.schema,
      dataFormat: r.dataFormat,
      dateCreated: r.dateCreated,
      author: r.author,
      published: r.published,
    }));
  }));
}
