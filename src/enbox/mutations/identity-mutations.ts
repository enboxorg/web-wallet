/**
 * Identity CRUD mutation functions.
 *
 * These are pure async functions called by TanStack Query mutation hooks.
 * They interact with the Enbox SDK agent to create, update, delete, and
 * import/export identities.
 *
 * SYNC POLICY: We do NOT manually manage sync (stopSync/startSync).
 * The SDK manages sync automatically. We only:
 * - Register new identity DIDs for sync
 * - Register DIDs as DWN tenants
 * - Install protocols locally before writing records
 */

import { Effect } from 'effect';
import { Enbox, repository } from '@enbox/api';
import {
  ProfileProtocol,
  ConnectProtocol,
} from '@enbox/protocols';

import type { EnboxAgent } from '../types';
import { IDENTITY_SYNC_PROTOCOLS, installProtocolsEffect } from '../protocols';
import { ensureRegistrationEffect } from '../registration';
import { DEFAULT_DWN_ENDPOINTS, WALLET_URL } from '@/lib/dwn-endpoints';
import {
  DuplicateIdentityError,
  IdentityNotFoundError,
  IdentityPublishError,
  sdkError,
} from '../effect/errors';
import { CurrentAgent, enboxLiveLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';
import { normalizeProfileImageBlob } from '@/lib/profile-images';
import { clearCachedProfileImagesEffect } from '../effect/profile-image-cache';
import { publishWalletEvent } from '../effect/wallet-events';

function registerIdentityForSyncEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    yield* Effect.tryPromise({
      try: () =>
        agent.sync.registerIdentity({
          did,
          options: { protocols: IDENTITY_SYNC_PROTOCOLS },
        }),
      catch: sdkError('sync.registerIdentity'),
    }).pipe(Effect.catchAll(() => Effect.void));
  });
}

function assertDhtDidPublishedEffect(identity: any) {
  const did = identity?.did?.uri;
  if (typeof did !== 'string' || !did.startsWith('did:dht:')) {
    return Effect.void;
  }

  if (identity?.did?.metadata?.published === false) {
    return Effect.fail(
      new IdentityPublishError({
        did,
        message: `Failed to publish DID ${did} to the DHT gateway`,
      }),
    );
  }

  return Effect.void;
}

function deleteLocalIdentityBestEffortEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;

    yield* Effect.tryPromise({
      try: () => agent.sync.unregisterIdentity(did),
      catch: sdkError('sync.unregisterIdentity'),
    }).pipe(Effect.catchAll(() => Effect.void));

    yield* Effect.tryPromise({
      try: () => agent.identity.delete({ didUri: did }),
      catch: sdkError('identity.delete'),
    }).pipe(Effect.catchAll(() => Effect.void));

    yield* Effect.tryPromise({
      try: () => agent.did.delete({ didUri: did, tenant: agent.agentDid.uri }),
      catch: sdkError('did.delete'),
    }).pipe(Effect.catchAll(() => Effect.void));
  });
}

function createEnboxEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.try({
      try: () => new Enbox({ agent, connectedDid: did }),
      catch: sdkError('enbox.create'),
    });
  });
}

function createWalletRecordBestEffortEffect(did: string, warningPrefix: string) {
  return Effect.gen(function* () {
    const enbox = yield* createEnboxEffect(did);
    const connect = enbox.using(ConnectProtocol);
    const { records: existingWallets } = yield* Effect.tryPromise({
      try: () => connect.records.query('wallet'),
      catch: sdkError('connect.wallet.query'),
    });

    if (existingWallets.length === 0) {
      yield* Effect.tryPromise({
        try: () =>
          connect.records.create('wallet', {
            data: { webWallets: [WALLET_URL] },
          }),
        catch: sdkError('connect.wallet.create'),
      });
    }
  }).pipe(
    Effect.catchAll((err) =>
      Effect.sync(() => {
        console.warn(warningPrefix, err);
      })
    ),
  );
}

function getIdentityEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: async (): Promise<any> => agent.identity.get({ didUri: did }),
      catch: sdkError('identity.get'),
    });
  });
}

function getRequiredIdentityEffect(did: string) {
  return Effect.gen(function* () {
    const identity = yield* getIdentityEffect(did);
    if (!identity) {
      return yield* Effect.fail(
        new IdentityNotFoundError({
          did,
          message: 'Identity not found',
        }),
      );
    }
    return identity;
  });
}

function normalizeProfileImageEffect(image: Blob, label: string) {
  return Effect.try({
    try: () => normalizeProfileImageBlob(image, label),
    catch: (err) => err instanceof Error ? err : new Error(String(err)),
  });
}

function setProfileImageEffect(
  repo: any,
  ctxId: string,
  kind: 'avatar' | 'hero',
  image: Blob,
  label: string,
) {
  return Effect.gen(function* () {
    const normalized = yield* normalizeProfileImageEffect(image, label);

    yield* Effect.tryPromise({
      try: () =>
        repo.profile[kind].set(ctxId, {
          data       : normalized,
          dataFormat : normalized.type,
        }),
      catch: sdkError(`profile.${kind}.set`),
    });
  });
}

function replaceProfileImageEffect(
  repo: any,
  ctxId: string,
  kind: 'avatar' | 'hero',
  image: Blob,
  label: string,
) {
  return Effect.gen(function* () {
    const normalized = yield* normalizeProfileImageEffect(image, label);
    const existing = (yield* Effect.tryPromise({
      try: () => repo.profile[kind].get(ctxId),
      catch: sdkError(`profile.${kind}.get`),
    })) as { delete(): Promise<unknown> } | undefined;

    if (existing) {
      yield* Effect.tryPromise({
        try: () => existing.delete(),
        catch: sdkError(`profile.${kind}.delete`),
      });
    }

    yield* Effect.tryPromise({
      try: () =>
        repo.profile[kind].set(ctxId, {
          data       : normalized,
          dataFormat : normalized.type,
        }),
      catch: sdkError(`profile.${kind}.set`),
    });
  });
}

// ── Create identity ────────────────────────────────────────────────

export interface CreateIdentityParams {
  persona: string;
  displayName: string;
  tagline?: string;
  bio?: string;
  avatar?: Blob;
  hero?: Blob;
  dwnEndpoints: string[];
}

export async function createIdentity(
  agent: EnboxAgent,
  params: CreateIdentityParams,
) {
  return runEnboxPromise(
    createIdentityEffect(params).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function createIdentityEffect(params: CreateIdentityParams) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    let createdIdentity: any | undefined;

  // 1. Create the DID + identity
    const identity = yield* Effect.gen(function* () {
      createdIdentity = yield* Effect.tryPromise({
        try: () =>
          agent.identity.create({
            store: true,
            didMethod: 'dht',
            didOptions: {
              services: [
                {
                  id: 'dwn',
                  type: 'DecentralizedWebNode',
                  serviceEndpoint: params.dwnEndpoints,
                  enc: '#enc',
                  sig: '#sig',
                },
              ],
              verificationMethods: [
                {
                  algorithm: 'Ed25519',
                  id: 'sig',
                  purposes: ['assertionMethod', 'authentication'],
                },
                {
                  algorithm: 'X25519',
                  id: 'enc',
                  purposes: ['keyAgreement'],
                },
              ],
            },
            metadata: { name: params.persona },
          }),
        catch: sdkError('identity.create'),
      });

      const did: string = createdIdentity.did.uri;
      yield* assertDhtDidPublishedEffect(createdIdentity);

      // 2. Register identity as DWN tenant on remote endpoints.
      //    Must happen before sync registration — with live sync active,
      //    registerIdentity hot-adds a subscription that requires the DID
      //    to be a recognised tenant on the remote DWN.
      yield* ensureRegistrationEffect(params.dwnEndpoints);

      // 3. Install protocols locally before writing records. Remote propagation
      //    is handled by sync through replicated admission dependencies.
      yield* installProtocolsEffect(did);

      return createdIdentity;
    }).pipe(
      Effect.tapError(() => {
        const did = createdIdentity?.did?.uri;
        return did ? deleteLocalIdentityBestEffortEffect(did) : Effect.void;
      }),
    );

    const did: string = identity.did.uri;

    // 4. Register identity DID for sync after protocol bootstrap is complete.
    yield* registerIdentityForSyncEffect(did);

    // 5. Set profile social data
    const enbox = yield* createEnboxEffect(did);
    const repo = repository(enbox.using(ProfileProtocol));

    const socialData = {
      displayName: params.displayName,
      ...(params.tagline && { tagline: params.tagline }),
      ...(params.bio && { bio: params.bio }),
    };

    const { record: profileRecord } = yield* Effect.tryPromise({
      try: () =>
        repo.profile.set({
          data: socialData,
          published: true,
        }),
      catch: sdkError('profile.set'),
    });

    // 6. Set avatar if provided
    if (params.avatar && profileRecord) {
      const ctxId = profileRecord.contextId as string;
      yield* setProfileImageEffect(repo, ctxId, 'avatar', params.avatar, 'Avatar image');
    }

    // 7. Set hero if provided
    if (params.hero && profileRecord) {
      const ctxId = profileRecord.contextId as string;
      yield* setProfileImageEffect(repo, ctxId, 'hero', params.hero, 'Banner image');
    }

    // 8. Create wallet record
    yield* createWalletRecordBestEffortEffect(did, 'Failed to create wallet record:');

    yield* publishWalletEvent({ _tag: 'identity.created', did });
    yield* publishWalletEvent({
      _tag     : 'identity.profile.updated',
      did,
      avatar   : params.avatar !== undefined,
      hero     : params.hero !== undefined,
      metadata : true,
      timestamp: Date.now(),
    });

    return identity;
  });
}

// ── Update profile ─────────────────────────────────────────────────

export interface UpdateIdentityProfileParams {
  did: string;
  persona?: string;
  displayName: string;
  tagline?: string;
  bio?: string;
  avatar?: Blob | null;
  hero?: Blob | null;
}

export async function updateIdentityProfile(
  agent: EnboxAgent,
  params: UpdateIdentityProfileParams,
) {
  return runEnboxPromise(
    updateIdentityProfileEffect(params).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function updateIdentityProfileEffect(params: UpdateIdentityProfileParams) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;

    if (params.persona) {
      yield* Effect.tryPromise({
        try: () =>
          agent.identity.setMetadataName({
            didUri: params.did,
            name: params.persona,
          }),
        catch: sdkError('identity.setMetadataName'),
      });
    }

    const enbox = yield* createEnboxEffect(params.did);
    const repo = repository(enbox.using(ProfileProtocol));

    const socialData = {
      displayName: params.displayName,
      ...(params.tagline !== undefined && { tagline: params.tagline }),
      ...(params.bio !== undefined && { bio: params.bio }),
    };

    const { record: profileRecord } = yield* Effect.tryPromise({
      try: () =>
        repo.profile.set({
          data: socialData,
          published: true,
        }),
      catch: sdkError('profile.set'),
    });

    const ctxId = profileRecord?.contextId as string | undefined;

    if (params.avatar !== undefined && ctxId) {
      if (params.avatar) {
        yield* replaceProfileImageEffect(repo, ctxId, 'avatar', params.avatar, 'Avatar image');
      } else {
        const existing = yield* Effect.tryPromise({
          try: () => repo.profile.avatar.get(ctxId),
          catch: sdkError('profile.avatar.get'),
        });
        if (existing) {
          yield* Effect.tryPromise({
            try: () => existing.delete(),
            catch: sdkError('profile.avatar.delete'),
          });
        }
      }
    }

    if (params.hero !== undefined && ctxId) {
      if (params.hero) {
        yield* replaceProfileImageEffect(repo, ctxId, 'hero', params.hero, 'Banner image');
      } else {
        const existing = yield* Effect.tryPromise({
          try: () => repo.profile.hero.get(ctxId),
          catch: sdkError('profile.hero.get'),
        });
        if (existing) {
          yield* Effect.tryPromise({
            try: () => existing.delete(),
            catch: sdkError('profile.hero.delete'),
          });
        }
      }
    }

    yield* publishWalletEvent({
      _tag     : 'identity.profile.updated',
      did      : params.did,
      avatar   : params.avatar !== undefined,
      hero     : params.hero !== undefined,
      metadata : true,
      timestamp: Date.now(),
    });
  });
}

// ── Delete identity ────────────────────────────────────────────────

export async function deleteIdentity(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    deleteIdentityEffect(did).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function deleteIdentityEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    yield* getRequiredIdentityEffect(did);

    yield* Effect.tryPromise({
      try: () => agent.sync.unregisterIdentity(did),
      catch: sdkError('sync.unregisterIdentity'),
    }).pipe(Effect.catchAll(() => Effect.void));

    yield* Effect.tryPromise({
      try: () => agent.identity.delete({ didUri: did }),
      catch: sdkError('identity.delete'),
    });

    yield* Effect.tryPromise({
      try: () => agent.did.delete({ didUri: did, tenant: agent.agentDid.uri }),
      catch: sdkError('did.delete'),
    });

    yield* clearCachedProfileImagesEffect(did);
    yield* publishWalletEvent({ _tag: 'identity.deleted', did });
  });
}

// ── Export identity ────────────────────────────────────────────────

export async function exportIdentity(agent: EnboxAgent, did: string) {
  return runEnboxPromise(
    exportIdentityEffect(did).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function exportIdentityEffect(did: string) {
  return Effect.gen(function* () {
    const identity = yield* getRequiredIdentityEffect(did);
    return yield* Effect.tryPromise({
      try: async () => identity.export(),
      catch: sdkError('identity.export'),
    });
  });
}

// ── Import identity ────────────────────────────────────────────────

export async function importIdentity(
  agent: EnboxAgent,
  portableIdentity: any,
) {
  return runEnboxPromise(
    importIdentityEffect(portableIdentity).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function importIdentityEffect(portableIdentity: any) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const existing = yield* getIdentityEffect(portableIdentity.portableDid?.uri);
    if (existing) {
      return yield* Effect.fail(
        new DuplicateIdentityError({
          did: portableIdentity.portableDid?.uri,
          message: 'Identity already exists',
        }),
      );
    }

    const identity = yield* Effect.tryPromise({
      try: async (): Promise<any> => agent.identity.import({ portableIdentity }),
      catch: sdkError('identity.import'),
    });
    const did = identity.did.uri;

    yield* Effect.gen(function* () {
      // Register imported identity as DWN tenant before sync (same reason as createIdentity)
      yield* ensureRegistrationEffect(DEFAULT_DWN_ENDPOINTS);

      // Install protocols locally before registering sync and writing records.
      yield* installProtocolsEffect(did);
    }).pipe(
      Effect.tapError(() => deleteLocalIdentityBestEffortEffect(did)),
    );

    // Register for sync
    yield* registerIdentityForSyncEffect(did);

    // Create wallet record
    yield* createWalletRecordBestEffortEffect(
      did,
      'Failed to create wallet record on import:',
    );

    yield* publishWalletEvent({ _tag: 'identity.imported', did });

    return identity;
  });
}

// ── Update DWN endpoints ───────────────────────────────────────────

export interface UpdateDwnEndpointsParams {
  did: string;
  endpoints: string[];
}

export async function updateDwnEndpoints(
  agent: EnboxAgent,
  params: UpdateDwnEndpointsParams,
) {
  return runEnboxPromise(
    updateDwnEndpointsEffect(params).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function updateDwnEndpointsEffect(params: UpdateDwnEndpointsParams) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    yield* Effect.tryPromise({
      try: () =>
        agent.identity.setDwnEndpoints({
          didUri: params.did,
          endpoints: params.endpoints,
        }),
      catch: sdkError('identity.setDwnEndpoints'),
    });
    yield* publishWalletEvent({
      _tag : 'identity.dwnEndpoints.updated',
      did  : params.did,
    });
  });
}
