import type { SyncEvent } from '@enbox/agent';

import { normalizeDwnEndpoints } from '@/lib/dwn-endpoints';

import type { EnboxAgent } from './types';
import { makeKeyedSingleFlight } from './effect/keyed-single-flight';
import { ensureRegistrationForDids } from './registration';

const REPAIRABLE_REGISTRATION_DETAILS = [
  'Not a registered tenant.',
  'Agreed terms-of-service is outdated.',
] as const;

const registrationRepairFlights = makeKeyedSingleFlight();
const repairQueuesByAgent = new WeakMap<object, Map<string, Promise<unknown>>>();

function runRegistrationRepairSerial<T>(
  agent: object,
  did: string,
  operation: () => Promise<T>,
): Promise<T> {
  let queues = repairQueuesByAgent.get(agent);
  if (queues === undefined) {
    queues = new Map();
    repairQueuesByAgent.set(agent, queues);
  }

  const previous = queues.get(did) ?? Promise.resolve();
  const repair = previous.catch(() => undefined).then(operation);
  queues.set(did, repair);
  const cleanup = (): void => {
    if (queues.get(did) === repair) {
      queues.delete(did);
    }
  };
  void repair.then(cleanup, cleanup);
  return repair;
}

/**
 * Match only the server's definitive registration failures. A suspended
 * tenant, generic 401, or transport failure must remain a visible failure and
 * must never trigger an account-affecting registration request.
 */
export function isRepairableRegistrationFailure(error: string): boolean {
  const normalizedError = error.trim();
  if (!/(?:^|\D)401(?:\D|$)/.test(normalizedError)) {
    return false;
  }

  return REPAIRABLE_REGISTRATION_DETAILS.some((detail) =>
    normalizedError.endsWith(detail)
  );
}

/**
 * Repair a remote tenant registration only after sync receives a definitive
 * server rejection. Rebuilding the local sync registration removes a durable
 * paused link and immediately reopens live links with the existing scope.
 * Concurrent failures from multiple protocol projections share one repair.
 */
export async function repairRegistrationFromSyncEvent(
  agent: EnboxAgent,
  event: SyncEvent,
): Promise<boolean> {
  if (event.type !== 'repair:failed' || !isRepairableRegistrationFailure(event.error)) {
    return false;
  }

  const [endpoint] = normalizeDwnEndpoints([event.remoteEndpoint]);
  const repairKey = JSON.stringify([event.tenantDid, endpoint]);
  await registrationRepairFlights.run(agent, repairKey, () =>
    runRegistrationRepairSerial(agent, event.tenantDid, async (): Promise<void> => {
      await ensureRegistrationForDids(agent, [endpoint], [event.tenantDid]);

      const syncOptions = await agent.sync.getIdentityOptions(event.tenantDid);
      if (syncOptions === undefined) {
        return;
      }

      await agent.sync.unregisterIdentity(event.tenantDid);
      await agent.sync.registerIdentity({
        did     : event.tenantDid,
        options : syncOptions,
      });
    })
  );

  return true;
}
