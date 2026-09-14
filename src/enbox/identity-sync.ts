import { Effect } from 'effect';

import {
  IDENTITY_SYNC_PROTOCOLS,
  installProtocolsEffect,
} from './protocols';
import type { EnboxAgent } from './types';
import { sdkError } from './effect/errors';
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

function getIdentitySyncTarget(identity: unknown): IdentityTarget | undefined {
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

export function getIdentitySyncTargets(identities: readonly unknown[]): IdentityTarget[] {
  const targets = new Map<string, IdentityTarget>();
  for (const identity of identities) {
    const target = getIdentitySyncTarget(identity);
    if (target === undefined) {
      continue;
    }

    // Collapse duplicate views of one connected identity. Once an owner view
    // is present, a delegated view must not replace its broader authority.
    const existing = targets.get(target.connectedDid);
    if (existing !== undefined && existing.delegateDid === undefined) {
      continue;
    }
    targets.set(target.connectedDid, target);
  }
  return [...targets.values()];
}

export function ensureIdentitySyncOptionsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.tryPromise({
      try: () => agent.sync.ensureIdentityOptions({
        did,
        options: { protocols: [...IDENTITY_SYNC_PROTOCOLS] },
      }),
      catch: sdkError('sync.ensureIdentityOptions'),
    });
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
    const ownerDids = getIdentitySyncTargets(identities)
      .filter((target) => target.delegateDid === undefined)
      .map((target) => target.connectedDid);
    if (ownerDids.length === 0) {
      return { changedDids: [], failedDids: [] };
    }

    const changedDids: string[] = [];
    const failedDids: string[] = [];
    for (const did of ownerDids) {
      const changed = yield* Effect.gen(function* () {
        yield* installProtocolsEffect(did);
        return yield* ensureIdentitySyncOptionsEffect(did);
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
