/**
 * Query functions for fetching identity-related data from the Enbox SDK.
 *
 * These are **pure async functions** — not hooks — so they can be used
 * directly inside TanStack Query `queryFn` callbacks.
 */

import type { MaterializedRecord } from '@enbox/browser';

import { Effect } from 'effect';
import { ProfileProtocol } from '@enbox/protocols';
import { DwnDateSort } from '@enbox/agent';

import type { EnboxAgent, IdentityProfileData, IdentityProfileImage } from '../types';
import { sdkError } from '../effect/errors';
import { withEnboxEffect } from '../effect/enbox-effect';
import { CurrentAgent, currentAgentLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';

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
    const profileApi = enbox.using(ProfileProtocol);

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

// ── Protocols ──────────────────────────────────────────────────────

/** Installed protocol definitions for the given DID. */
export async function fetchProtocols(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    fetchProtocolsEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchProtocolsEffect(did: string) {
  return withEnboxEffect(did, (enbox) => Effect.gen(function* () {
    const { protocols } = yield* Effect.tryPromise({
      try: async () => enbox.dwn.protocols.query({}),
      catch: sdkError('protocols.query'),
    });
    return protocols.map((p) => ({
      uri: p.definition.protocol as string,
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
        return entries.map(({ grant }) => grant);
      },
      catch: sdkError('permissions.fetchGrants'),
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
  protocol?: string;
  protocolPath?: string;
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
    const { records } = yield* Effect.tryPromise({
      try: async () =>
        enbox.dwn.records.query({
          filter: {},
          dateSort: DwnDateSort.CreatedDescending,
          pagination: { limit },
        }),
      catch: sdkError('records.query.activity'),
    });

    return records.map((r) => ({
      id: r.id,
      protocol: r.protocol,
      protocolPath: r.protocolPath,
      schema: r.schema,
      dataFormat: r.dataFormat,
      dateCreated: r.dateCreated,
      author: r.author,
      published: r.published,
    }));
  }));
}
