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
 * server rejection. Refreshing routing removes the durable paused link and
 * immediately reopens live links with the existing scope.
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
  await registrationRepairFlights.run(agent, repairKey, async (): Promise<void> => {
    await ensureRegistrationForDids(agent, [endpoint], [event.tenantDid]);
    await agent.sync.refreshIdentityRouting(event.tenantDid);
  });

  return true;
}
