import { Effect } from 'effect';
import type { SyncIdentityOptions } from '@enbox/agent';

import {
  IDENTITY_SYNC_PROTOCOLS,
  installProtocolsEffect,
} from './protocols';
import type { EnboxAgent } from './types';
import { sdkError } from './effect/errors';
import { runIdentitySetupSingleFlight } from './effect/keyed-single-flight';
import { CurrentAgent, enboxLiveLayer } from './effect/services';
import { runEnboxPromise } from './effect/runtime';

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
  protocols: readonly [string, ...string[]],
): boolean {
  if (!existing || existing.protocols === 'all') {
    return false;
  }

  if (existing.delegateDid !== undefined) {
    return false;
  }

  if (existing.protocols.length !== protocols.length) {
    return false;
  }

  return protocols.every((protocol) =>
    existing.protocols.includes(protocol)
  );
}

function getSyncOptionsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;

    return yield* Effect.tryPromise({
      try: async (): Promise<SyncIdentityOptions | undefined> =>
        agent.sync.getIdentityOptions(did),
      catch: sdkError('sync.getIdentityOptions'),
    });
  });
}

function applySyncOptionsEffect(
  did: string,
  protocols: readonly [string, ...string[]],
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const options: SyncIdentityOptions = {
      protocols: [...protocols],
    };

    yield* Effect.tryPromise({
      try: () => runIdentitySetupSingleFlight(
        agent,
        did,
        async () => agent.sync.setIdentityOptions({ did, options }),
      ),
      catch: sdkError('sync.setIdentityOptions'),
    });

    return true;
  });
}

/**
 * Keep owner protocol definitions and sync registrations current. AuthManager
 * owns delegated registration scope because it derives that scope from grants.
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
      if (delegateDid !== undefined) {
        continue;
      }
      const changed = yield* Effect.gen(function* () {
        const existing = yield* getSyncOptionsEffect(did);
        yield* installProtocolsEffect(did);
        if (sameProtocolScope(existing, IDENTITY_SYNC_PROTOCOLS)) {
          return false;
        }
        return yield* applySyncOptionsEffect(did, IDENTITY_SYNC_PROTOCOLS);
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
