import { Effect } from 'effect';

import { normalizeDwnEndpoints } from '@/lib/dwn-endpoints';

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
  failedDids: string[];
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

function applySyncOptionsEffect(
  did: string,
  existing: SyncIdentityOptions | undefined,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const options = {
      ...(existing?.delegateDid && { delegateDid: existing.delegateDid }),
      protocols: IDENTITY_SYNC_PROTOCOLS,
    };

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
): Promise<IdentitySyncReconcileResult> {
  return runEnboxPromise(
    reconcileIdentitySyncEffect(identities).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function reconcileIdentitySyncEffect(
  identities: unknown[],
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const dids = [...new Set(identities.map(getIdentityDid).filter(Boolean) as string[])];
    if (dids.length === 0) {
      return { changedDids: [], failedDids: [] };
    }

    const changedDids: string[] = [];
    const failedDids: string[] = [];
    for (const did of dids) {
      const changed = yield* Effect.gen(function* () {
        const existing = yield* getSyncOptionsEffect(did);
        if (sameProtocolScope(existing)) {
          return false;
        }
        const dwnEndpoints = yield* Effect.tryPromise({
          try: async () => normalizeDwnEndpoints(
            await agent.dwn.getRemoteDwnEndpointUrls(did),
          ),
          catch: sdkError('identitySync.resolveDwnEndpoints'),
        });
        yield* ensureRegistrationEffect(dwnEndpoints, [did]);
        return yield* applySyncOptionsEffect(did, existing);
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.warn(`Identity sync reconciliation failed for ${did}:`, error);
            failedDids.push(did);
            return false;
          })
        ),
      );
      if (changed) {
        changedDids.push(did);
      }
    }

    return { changedDids, failedDids };
  });
}
