import { Effect } from 'effect';
import { normalizeSyncModules } from '@enbox/agent';

import {
  IDENTITY_SYNC_MODULES,
  installModulesEffect,
} from './modules';
import type { EnboxAgent } from './types';
import { sdkError } from './effect/errors';
import { CurrentAgent, enboxLiveLayer } from './effect/services';
import { runEnboxPromise } from './effect/runtime';

const RECONCILE_CONCURRENCY = 4;
const NORMALIZED_IDENTITY_SYNC_MODULES = normalizeSyncModules(IDENTITY_SYNC_MODULES);

function hasExpectedOwnerSyncOptions(options: unknown): boolean {
  if (!options || typeof options !== 'object') {
    return false;
  }
  const candidate = options as { delegateDid?: unknown; modules?: unknown };
  if (
    candidate.delegateDid !== undefined
    || !Array.isArray(candidate.modules)
    || candidate.modules.length === 0
    || !candidate.modules.every((m): m is string => typeof m === 'string' && m.length > 0)
  ) {
    return false;
  }
  try {
    const existingModules = normalizeSyncModules(candidate.modules);
    return existingModules.length === NORMALIZED_IDENTITY_SYNC_MODULES.length
      && existingModules.every((module, index) => module === NORMALIZED_IDENTITY_SYNC_MODULES[index]);
  } catch {
    return false;
  }
}

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
    // Fast-path: check current options lock-free before calling
    // ensureIdentityOptions(), which acquires both the engine-local sync lock
    // and the cross-context Web Lock `enbox:sync-identity:<ns>:<did>` before
    // noticing that options are already identical.
    if (typeof agent.sync.getIdentityOptions === 'function') {
      const existing = yield* Effect.tryPromise({
        try: () => agent.sync.getIdentityOptions(did),
        catch: sdkError('sync.getIdentityOptions'),
      }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));

      if (hasExpectedOwnerSyncOptions(existing)) {
        return false;
      }
    }

    return yield* Effect.tryPromise({
      try: () => agent.sync.ensureIdentityOptions({
        did,
        options: { modules: [...IDENTITY_SYNC_MODULES] },
      }),
      catch: sdkError('sync.ensureIdentityOptions'),
    });
  });
}

/**
 * Keep owner module definitions and sync registrations current. AuthManager
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
    yield* Effect.forEach(ownerDids, (did) =>
      Effect.gen(function* () {
        yield* installModulesEffect(did);
        const changed = yield* ensureIdentitySyncOptionsEffect(did);
        if (changed) {
          changedDids.push(did);
        }
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            console.warn(`Identity reconciliation failed for ${did}:`, error);
            failedDids.push(did);
          })
        ),
      ),
    { concurrency: RECONCILE_CONCURRENCY });

    return { changedDids, failedDids };
  });
}
