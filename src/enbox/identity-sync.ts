import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';

import { ensureRegistration } from './registration';
import { IDENTITY_SYNC_PROTOCOLS } from './protocols';
import type { EnboxAgent } from './types';

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

const SYNC_PULL_RETRY_DELAYS_MS = [0, 500, 1_500, 3_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSyncInProgress(error: unknown): boolean {
  return getErrorMessage(error).includes('Sync operation is already in progress');
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

async function pullWithRetry(agent: EnboxAgent): Promise<void> {
  let lastError: unknown;

  for (const delayMs of SYNC_PULL_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      await agent.sync.sync('pull');
      return;
    } catch (error) {
      lastError = error;
      if (!isSyncInProgress(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

async function getSyncOptions(
  agent: EnboxAgent,
  did: string,
): Promise<SyncIdentityOptions | undefined> {
  if (typeof agent.sync.getIdentityOptions !== 'function') {
    return undefined;
  }

  return agent.sync.getIdentityOptions(did);
}

async function applySyncOptions(agent: EnboxAgent, did: string): Promise<boolean> {
  const existing = await getSyncOptions(agent, did);
  const options = {
    ...(existing?.delegateDid && { delegateDid: existing.delegateDid }),
    protocols: IDENTITY_SYNC_PROTOCOLS,
  };

  if (sameProtocolScope(existing)) {
    return false;
  }

  if (existing && typeof agent.sync.updateIdentityOptions === 'function') {
    await agent.sync.updateIdentityOptions({ did, options });
    return true;
  }

  try {
    await agent.sync.registerIdentity({ did, options });
    return true;
  } catch (error) {
    if (
      getErrorMessage(error).includes('already registered') &&
      typeof agent.sync.updateIdentityOptions === 'function'
    ) {
      await agent.sync.updateIdentityOptions({ did, options });
      return true;
    }
    throw error;
  }
}

/**
 * Ensure every locally known identity is registered for the wallet's scoped
 * sync protocols. When another wallet creates an identity, this wallet first
 * learns only the identity metadata through the agent DID, then must opt into
 * profile/social/connect replication for that new DID and pull its existing
 * records.
 */
export async function reconcileIdentitySync(
  agent: EnboxAgent,
  identities: unknown[],
  dwnEndpoints: string[] = DEFAULT_DWN_ENDPOINTS,
): Promise<IdentitySyncReconcileResult> {
  const dids = [...new Set(identities.map(getIdentityDid).filter(Boolean) as string[])];
  if (dids.length === 0) {
    return { changedDids: [] };
  }

  const didsToChange: string[] = [];
  for (const did of dids) {
    const existing = await getSyncOptions(agent, did);
    if (!sameProtocolScope(existing)) {
      didsToChange.push(did);
    }
  }

  if (didsToChange.length === 0) {
    return { changedDids: [] };
  }

  await ensureRegistration(agent, dwnEndpoints);

  const changedDids: string[] = [];
  for (const did of didsToChange) {
    if (await applySyncOptions(agent, did)) {
      changedDids.push(did);
    }
  }

  if (changedDids.length > 0) {
    await pullWithRetry(agent);
  }

  return { changedDids };
}
