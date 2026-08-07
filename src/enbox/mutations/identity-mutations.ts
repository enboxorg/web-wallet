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
import { Enbox } from '@enbox/api';
import {
  ProfileProtocol,
  ConnectProtocol,
} from '@enbox/protocols';

import type { EnboxAgent } from '../types';
import { IDENTITY_SYNC_PROTOCOLS, installProtocolsEffect } from '../protocols';
import { ensureRegistrationEffect } from '../registration';
import { normalizeDwnEndpoints, WALLET_URL } from '@/lib/dwn-endpoints';
import {
  DuplicateIdentityError,
  IdentityNotFoundError,
  IdentityPublishError,
  sdkError,
} from '../effect/errors';
import { CurrentAgent, enboxLiveLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';
import { runIdentitySetupSingleFlight } from '../effect/keyed-single-flight';
import { normalizeProfileImageBlob } from '@/lib/profile-images';
import {
  ensurePortableOwnerPublished,
  portableOwnerDocumentsMatch,
  type ValidatedPortableOwnerIdentity,
  validatePortableOwnerIdentity,
} from '@/features/connect/portable-owner-identity';
import { clearCachedProfileImagesEffect } from '../effect/profile-image-cache';
import { publishWalletEvent } from '../effect/wallet-events';

function registerIdentityForSyncEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    yield* Effect.tryPromise({
      try: () =>
        runIdentitySetupSingleFlight(
          agent,
          did,
          () => agent.sync.registerIdentity({
            did,
            options: { protocols: IDENTITY_SYNC_PROTOCOLS },
          }),
        ),
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

function createProfileApi(enbox: Enbox) {
  return enbox.using(ProfileProtocol);
}

type ProfileApi = ReturnType<typeof createProfileApi>;

function requireRecordContextId(record: { contextId?: string }): string {
  if (record.contextId === undefined) {
    throw new Error('Profile record is missing its context ID.');
  }
  return record.contextId;
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

async function readProfileImage(
  api: ProfileApi,
  contextId: string,
  kind: 'avatar' | 'hero',
) {
  const { records } = await api.records.query(`profile/${kind}`, {
    within: contextId,
  });
  return records[0];
}

function normalizeProfileImageEffect(image: Blob, label: string) {
  return Effect.try({
    try: () => normalizeProfileImageBlob(image, label),
    catch: (err) => err instanceof Error ? err : new Error(String(err)),
  });
}

function setProfileImageEffect(
  api: ProfileApi,
  contextId: string,
  kind: 'avatar' | 'hero',
  image: Blob,
  label: string,
) {
  return Effect.gen(function* () {
    const normalized = yield* normalizeProfileImageEffect(image, label);

    yield* Effect.tryPromise({
      try: () => api.records.set(`profile/${kind}`, {
        data   : normalized,
        within : contextId,
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
    const dwnEndpoints = yield* Effect.try({
      try   : () => normalizeDwnEndpoints(params.dwnEndpoints),
      catch : sdkError('identity.validateDwnEndpoints'),
    });
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
                  serviceEndpoint: dwnEndpoints,
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
      yield* ensureRegistrationEffect(dwnEndpoints, [did]);

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
    const api = createProfileApi(enbox);

    const socialData = {
      displayName: params.displayName,
      ...(params.tagline && { tagline: params.tagline }),
      ...(params.bio && { bio: params.bio }),
    };

    const profileRecord = yield* Effect.tryPromise({
      try: () => api.records.set('profile', {
        data      : socialData,
        published : true,
      }),
      catch: sdkError('profile.set'),
    });
    const profileContextId = requireRecordContextId(profileRecord);

    // 6. Set avatar if provided
    if (params.avatar) {
      yield* setProfileImageEffect(api, profileContextId, 'avatar', params.avatar, 'Avatar image');
    }

    // 7. Set hero if provided
    if (params.hero) {
      yield* setProfileImageEffect(api, profileContextId, 'hero', params.hero, 'Banner image');
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

    const persona = params.persona;
    if (persona) {
      yield* Effect.tryPromise({
        try: () =>
          agent.identity.setMetadataName({
            didUri: params.did,
            name: persona,
          }),
        catch: sdkError('identity.setMetadataName'),
      });
    }

    const enbox = yield* createEnboxEffect(params.did);
    const api = createProfileApi(enbox);

    const socialData = {
      displayName: params.displayName,
      ...(params.tagline !== undefined && { tagline: params.tagline }),
      ...(params.bio !== undefined && { bio: params.bio }),
    };

    const profileRecord = yield* Effect.tryPromise({
      try: () => api.records.set('profile', {
        data      : socialData,
        published : true,
      }),
      catch: sdkError('profile.set'),
    });

    const contextId = requireRecordContextId(profileRecord);

    if (params.avatar !== undefined) {
      if (params.avatar) {
        yield* setProfileImageEffect(api, contextId, 'avatar', params.avatar, 'Avatar image');
      } else {
        const existing = yield* Effect.tryPromise({
          try: () => readProfileImage(api, contextId, 'avatar'),
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

    if (params.hero !== undefined) {
      if (params.hero) {
        yield* setProfileImageEffect(api, contextId, 'hero', params.hero, 'Banner image');
      } else {
        const existing = yield* Effect.tryPromise({
          try: () => readProfileImage(api, contextId, 'hero'),
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
  options: ImportIdentityOptions = {},
) {
  return runEnboxPromise(
    importIdentityEffect(portableIdentity, options).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

type ImportIdentityOptions = {
  allowExistingExact?: boolean;
  ensurePublished?: boolean;
};

export async function importValidatedIdentity(
  agent: EnboxAgent,
  validatedIdentity: ValidatedPortableOwnerIdentity,
  options: ImportIdentityOptions = {},
) {
  return runEnboxPromise(
    importValidatedIdentityEffect(validatedIdentity, options).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function importIdentityEffect(
  portableIdentity: any,
  options: ImportIdentityOptions = {},
) {
  return Effect.tryPromise({
    try: async () => validatePortableOwnerIdentity(portableIdentity),
    catch: sdkError('identity.validatePortableOwner'),
  }).pipe(
    Effect.flatMap((validatedIdentity) => importValidatedIdentityEffect(validatedIdentity, options)),
  );
}

function importValidatedIdentityEffect(
  validatedIdentity: ValidatedPortableOwnerIdentity,
  options: ImportIdentityOptions,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const existing = yield* getIdentityEffect(validatedIdentity.did);
    let identity: any;
    if (existing) {
      if (!options.allowExistingExact) {
        return yield* Effect.fail(
          new DuplicateIdentityError({
            did: validatedIdentity.did,
            message: 'Identity already exists',
          }),
        );
      }
      const existingPortableIdentity = yield* Effect.tryPromise({
        try: async () => existing.export(),
        catch: sdkError('identity.exportExisting'),
      });
      if (!portableOwnerDocumentsMatch(
        existingPortableIdentity.portableDid.document,
        validatedIdentity.portableIdentity.portableDid.document,
      )) {
        return yield* Effect.fail(
          new DuplicateIdentityError({
            did: validatedIdentity.did,
            message: 'Identity already exists',
          }),
        );
      }
      identity = existing;
    }

    if (options.ensurePublished) {
      yield* Effect.tryPromise({
        try: async () => ensurePortableOwnerPublished(validatedIdentity),
        catch: sdkError('identity.publishPortableOwner'),
      });
    }

    const importedNewIdentity = existing === undefined;
    if (importedNewIdentity) {
      identity = yield* Effect.tryPromise({
        try: async (): Promise<any> => agent.identity.import({
          portableIdentity: validatedIdentity.portableIdentity,
        }),
        catch: sdkError('identity.import'),
      });
    }
    const did = identity.did.uri;
    if (did !== validatedIdentity.did) {
      yield* deleteLocalIdentityBestEffortEffect(did);
      return yield* Effect.fail(
        sdkError('identity.importDidMismatch')(
          new Error('Imported identity does not match the validated owner DID.'),
        ),
      );
    }

    const prepareImportedIdentity = Effect.gen(function* () {
      // Import preserves the DID's existing remote tenant ownership. Re-registering
      // here could silently rebind a provider-auth account, so only prepare local state.
      yield* installProtocolsEffect(did);
    });
    yield* importedNewIdentity
      ? prepareImportedIdentity.pipe(
          Effect.tapError(() => deleteLocalIdentityBestEffortEffect(did)),
        )
      : prepareImportedIdentity;

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
    const endpoints = yield* Effect.try({
      try   : () => normalizeDwnEndpoints(params.endpoints),
      catch : sdkError('identity.validateDwnEndpoints'),
    });
    const currentEndpoints = yield* Effect.tryPromise({
      try: async () => normalizeDwnEndpoints(
        await agent.dwn.getRemoteDwnEndpointUrls(params.did),
      ),
      catch: sdkError('identity.resolveDwnEndpoints'),
    });
    const currentEndpointSet = new Set(currentEndpoints);
    const addedEndpoints = endpoints.filter((endpoint) => !currentEndpointSet.has(endpoint));
    if (addedEndpoints.length > 0) {
      yield* ensureRegistrationEffect(addedEndpoints, [params.did]);
    }
    yield* Effect.tryPromise({
      try: () =>
        agent.identity.setDwnEndpoints({
          didUri: params.did,
          endpoints,
        }),
      catch: sdkError('identity.setDwnEndpoints'),
    });
    const syncOptions = yield* Effect.tryPromise({
      try: async () => agent.sync.getIdentityOptions(params.did),
      catch: sdkError('sync.getIdentityOptions'),
    });
    if (syncOptions !== undefined) {
      yield* Effect.tryPromise({
        try: async () => agent.sync.updateIdentityOptions({ did: params.did, options: syncOptions }),
        catch: sdkError('sync.updateIdentityOptions'),
      });
    }
    yield* publishWalletEvent({
      _tag : 'identity.dwnEndpoints.updated',
      did  : params.did,
    });
  });
}
