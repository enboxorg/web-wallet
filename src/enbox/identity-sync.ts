import { Effect } from 'effect';

import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';

import { ensureRegistrationEffect } from './registration';
import { IDENTITY_SYNC_PROTOCOLS } from './protocols';
import type { EnboxAgent } from './types';
import { sdkError } from './effect/errors';
import { CurrentAgent, enboxLiveLayer } from './effect/services';
import { runEnboxPromise } from './effect/runtime';

type SyncIdentityOptions = {
  delegateDid?: string;
  protocols: 'all' | string[];
};

type IdentityLike = {
  did?: { uri?: unknown };
  metadata?: { connectedDid?: unknown };
};

export type IdentitySyncReconcileResult = {
  changedDids: string[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getIdentityDid(identity: unknown): string | undefined {
  const candidate = identity as IdentityLike | undefined;
  const did = candidate?.metadata?.connectedDid ?? candidate?.did?.uri;
  return typeof did === 'string' && did.length > 0 ? did : undefined;
}

function sameProtocolScope(existing: SyncIdentityOptions | undefined): boolean {
  if (!existing || existing.protocols === 'all') {
    return false;
  }

  if (existing.protocols.length !== IDENTITY_SYNC_PROTOCOLS.length) {
    return false;
  }

  return IDENTITY_SYNC_PROTOCOLS.every((protocol) =>
    existing.protocols.includes(protocol)
  );
}

function getSyncOptionsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;

    if (typeof agent.sync.getIdentityOptions !== 'function') {
      return undefined;
    }

    return yield* Effect.tryPromise({
      try: async (): Promise<SyncIdentityOptions | undefined> =>
        agent.sync.getIdentityOptions(did),
      catch: sdkError('sync.getIdentityOptions'),
    });
  });
}

function applySyncOptionsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const existing = yield* getSyncOptionsEffect(did);
    const options = {
      ...(existing?.delegateDid && { delegateDid: existing.delegateDid }),
      protocols: IDENTITY_SYNC_PROTOCOLS,
    };

    if (sameProtocolScope(existing)) {
      return false;
    }

    if (existing && typeof agent.sync.updateIdentityOptions === 'function') {
      yield* Effect.tryPromise({
        try: async () => agent.sync.updateIdentityOptions({ did, options }),
        catch: sdkError('sync.updateIdentityOptions'),
      });
      return true;
    }

    const registered = yield* Effect.tryPromise({
      try: async () => agent.sync.registerIdentity({ did, options }),
      catch: sdkError('sync.registerIdentity'),
    }).pipe(
      Effect.as(true),
      Effect.catchAll((error) => {
        if (
          getErrorMessage(error).includes('already registered') &&
          typeof agent.sync.updateIdentityOptions === 'function'
        ) {
          return Effect.tryPromise({
            try: async () => agent.sync.updateIdentityOptions({ did, options }),
            catch: sdkError('sync.updateIdentityOptions'),
          }).pipe(Effect.as(true));
        }
        return Effect.fail(error);
      }),
    );

    return registered;
  });
}

/**
 * Ensure every locally known identity is registered for the wallet's scoped
 * sync protocols. When another wallet creates an identity, this wallet first
 * learns only the identity metadata through the agent DID, then must opt into
 * profile/social/connect replication for that new DID. Registering the scope is
 * enough: the SDK's sync engine hot-adds the link and pulls the identity's
 * existing records on its own, so the wallet does not drive a manual pull.
 */
export async function reconcileIdentitySync(
  agent: EnboxAgent,
  identities: unknown[],
  dwnEndpoints: string[] = DEFAULT_DWN_ENDPOINTS,
): Promise<IdentitySyncReconcileResult> {
  return runEnboxPromise(
    reconcileIdentitySyncEffect(identities, dwnEndpoints).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function reconcileIdentitySyncEffect(
  identities: unknown[],
  dwnEndpoints: string[] = DEFAULT_DWN_ENDPOINTS,
) {
  return Effect.gen(function* () {
    const dids = [...new Set(identities.map(getIdentityDid).filter(Boolean) as string[])];
    if (dids.length === 0) {
      return { changedDids: [] };
    }

    const didsToChange: string[] = [];
    for (const did of dids) {
      const existing = yield* getSyncOptionsEffect(did);
      if (!sameProtocolScope(existing)) {
        didsToChange.push(did);
      }
    }

    if (didsToChange.length === 0) {
      return { changedDids: [] };
    }

    yield* ensureRegistrationEffect(dwnEndpoints);

    const changedDids: string[] = [];
    for (const did of didsToChange) {
      if (yield* applySyncOptionsEffect(did)) {
        changedDids.push(did);
      }
    }

    return { changedDids };
  });
}
