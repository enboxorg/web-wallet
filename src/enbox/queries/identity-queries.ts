/**
 * Query functions for fetching identity-related data from the Enbox SDK.
 *
 * These are **pure async functions** — not hooks — so they can be used
 * directly inside TanStack Query `queryFn` callbacks.
 */

import { Effect } from 'effect';
import { DwnApi } from '@enbox/api/advanced';
import { Enbox, repository } from '@enbox/api';
import { ConnectProtocol, ProfileProtocol } from '@enbox/protocols';
import { getDwnServiceEndpointUrls } from '@enbox/agent';

import type { EnboxAgent, IdentityProfile } from '../types';
import { sdkError } from '../effect/errors';
import { CurrentAgent, currentAgentLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';
import {
  clearCachedProfileImageUrlEffect,
  getCachedProfileImageUrlEffect,
} from '../effect/profile-image-cache';

function createEnboxEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.try({
      try: () => new Enbox({ agent, connectedDid: did }),
      catch: sdkError('enbox.create'),
    });
  });
}

function createDwnApiEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.try({
      try: () => new DwnApi({ agent, connectedDid: did }),
      catch: sdkError('dwnApi.create'),
    });
  });
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

/**
 * Resolve the full profile for a DID: social data, avatar blob URL,
 * and hero blob URL.
 *
 * Profile image object URLs are cached by DID and image record so React can
 * safely render across query refetches without losing the underlying blob.
 */
export async function fetchProfile(
  agent: EnboxAgent,
  did: string,
): Promise<IdentityProfile> {
  return runEnboxPromise(
    fetchProfileEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchProfileEffect(did: string) {
  return Effect.gen(function* () {
    const enbox = yield* createEnboxEffect(did);
    const repo = repository(enbox.using(ProfileProtocol));

    const profileRecord = yield* Effect.tryPromise({
      try: async () => repo.profile.get(),
      catch: sdkError('profile.get'),
    });
    const hasProfileRecord = profileRecord !== undefined;

    let socialData: { displayName: string; tagline?: string; bio?: string } = {
      displayName: '',
    };
    let avatarUrl: string | undefined;
    let heroUrl: string | undefined;

    if (profileRecord) {
      socialData = yield* Effect.tryPromise({
        try: async () => profileRecord.data.json(),
        catch: sdkError('profile.data.json'),
      });

      // Avatar
      const contextId = profileRecord.contextId as string;
      const avatarRecord = yield* Effect.tryPromise({
        try: async () => repo.profile.avatar.get(contextId),
        catch: sdkError('profile.avatar.get'),
      });
      if (avatarRecord) {
        avatarUrl = yield* getCachedProfileImageUrlEffect(did, 'avatar', avatarRecord);
      } else {
        yield* clearCachedProfileImageUrlEffect(did, 'avatar');
      }

      // Hero image
      const heroRecord = yield* Effect.tryPromise({
        try: async () => repo.profile.hero.get(contextId),
        catch: sdkError('profile.hero.get'),
      });
      if (heroRecord) {
        heroUrl = yield* getCachedProfileImageUrlEffect(did, 'hero', heroRecord);
      } else {
        yield* clearCachedProfileImageUrlEffect(did, 'hero');
      }
    } else {
      yield* clearCachedProfileImageUrlEffect(did, 'avatar');
      yield* clearCachedProfileImageUrlEffect(did, 'hero');
    }

    return {
      did,
      displayName: socialData.displayName,
      tagline: socialData.tagline,
      bio: socialData.bio,
      avatarUrl,
      heroUrl,
      hasProfileRecord,
    };
  });
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
  return Effect.gen(function* () {
    const dwn = yield* createDwnApiEffect(did);
    const { protocols } = yield* Effect.tryPromise({
      try: async () => dwn.protocols.query({}),
      catch: sdkError('protocols.query'),
    });
    return protocols.map((p: any) => ({
      uri: p.definition.protocol as string,
      published: (p.definition.published ?? false) as boolean,
      definition: p.definition,
    }));
  });
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
    const dwn = yield* createDwnApiEffect(did);
    return yield* Effect.tryPromise({
      try: async () => dwn.permissions.queryGrants(),
      catch: sdkError('permissions.queryGrants'),
    });
  });
}

// ── Wallets ────────────────────────────────────────────────────────

/** Wallet records stored via the Connect protocol. */
export async function fetchWallets(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    fetchWalletsEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchWalletsEffect(did: string) {
  return Effect.gen(function* () {
    const enbox = yield* createEnboxEffect(did);
    const connect = enbox.using(ConnectProtocol);
    const { records } = yield* Effect.tryPromise({
      try: async () => connect.records.query('wallet'),
      catch: sdkError('wallet.records.query'),
    });
    return yield* Effect.forEach(records, (r: any) =>
      Effect.tryPromise({
        try: async () => r.data.json(),
        catch: sdkError('wallet.record.json'),
      })
    );
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
      try: async () => getDwnServiceEndpointUrls(did, agent.did),
      catch: sdkError('did.getDwnServiceEndpointUrls'),
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
  return Effect.gen(function* () {
    const dwn = yield* createDwnApiEffect(did);

    const { records } = yield* Effect.tryPromise({
      try: async () =>
        dwn.records.query({
          filter: {},
          dateSort: 'createdDescending' as any,
          pagination: { limit },
        }),
      catch: sdkError('records.query.activity'),
    });

    return records.map((r: any) => ({
      id: r.id,
      protocol: r.protocol,
      protocolPath: r.protocolPath,
      schema: r.schema,
      dataFormat: r.dataFormat,
      dateCreated: r.dateCreated,
      author: r.author,
      published: r.published,
    }));
  });
}
