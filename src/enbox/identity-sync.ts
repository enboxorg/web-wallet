import { Effect } from 'effect';

import { IDENTITY_SYNC_PROTOCOLS, installProtocolsEffect } from './protocols';
import type { EnboxAgent } from './types';
import { sdkError } from './effect/errors';
import { runIdentitySetupSingleFlight } from './effect/keyed-single-flight';
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

type IdentityTarget = {
  connectedDid: string;
  delegateDid?: string;
};

export type IdentitySyncReconcileResult = {
  changedDids: string[];
  failedDids: string[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getIdentityTarget(identity: unknown): IdentityTarget | undefined {
  const candidate = identity as IdentityLike | undefined;
  const identityDid = candidate?.did?.uri;
  const connectedDid = candidate?.metadata?.connectedDid ?? identityDid;
  if (typeof connectedDid !== 'string' || connectedDid.length === 0) {
    return undefined;
  }

  return {
    connectedDid,
    ...(typeof identityDid === 'string'
      && identityDid.length > 0
      && identityDid !== connectedDid
      && { delegateDid: identityDid }),
  };
}

export function getIdentityDid(identity: unknown): string | undefined {
  return getIdentityTarget(identity)?.connectedDid;
}

function sameProtocolScope(
  existing: SyncIdentityOptions | undefined,
  delegateDid: string | undefined,
): boolean {
  if (!existing || existing.protocols === 'all') {
    return false;
  }

  if (existing.delegateDid !== delegateDid) {
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
  delegateDid: string | undefined,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const options = {
      ...(delegateDid && { delegateDid }),
      protocols: IDENTITY_SYNC_PROTOCOLS,
    };

    if (existing && typeof agent.sync.updateIdentityOptions === 'function') {
      yield* Effect.tryPromise({
        try: () => runIdentitySetupSingleFlight(
          agent,
          did,
          async () => agent.sync.updateIdentityOptions({ did, options }),
        ),
        catch: sdkError('sync.updateIdentityOptions'),
      });
      return true;
    }

    const registered = yield* Effect.tryPromise({
      try: () => runIdentitySetupSingleFlight(
        agent,
        did,
        async () => agent.sync.registerIdentity({ did, options }),
      ),
      catch: sdkError('sync.registerIdentity'),
    }).pipe(
      Effect.as(true),
      Effect.catchAll((error) => {
        if (
          getErrorMessage(error).includes('already registered') &&
          typeof agent.sync.updateIdentityOptions === 'function'
        ) {
          return Effect.tryPromise({
            try: () => runIdentitySetupSingleFlight(
              agent,
              did,
              async () => agent.sync.updateIdentityOptions({ did, options }),
            ),
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
 * Keep owner protocol definitions current and register every known identity
 * for profile/connect sync. Local protocol updates propagate through sync; the
 * wallet neither drives a manual pull nor re-registers an existing DID tenant.
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
    const targets = new Map<string, IdentityTarget>();
    for (const identity of identities) {
      const target = getIdentityTarget(identity);
      if (target !== undefined) {
        targets.set(target.connectedDid, target);
      }
    }
    if (targets.size === 0) {
      return { changedDids: [], failedDids: [] };
    }

    const changedDids: string[] = [];
    const failedDids: string[] = [];
    for (const { connectedDid: did, delegateDid } of targets.values()) {
      const changed = yield* Effect.gen(function* () {
        const existing = yield* getSyncOptionsEffect(did);
        if (delegateDid === undefined) {
          yield* installProtocolsEffect(did);
        }
        if (sameProtocolScope(existing, delegateDid)) {
          return false;
        }
        return yield* applySyncOptionsEffect(did, existing, delegateDid);
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.warn(`Identity reconciliation failed for ${did}:`, error);
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
