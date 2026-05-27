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
 * - Install protocols locally and send them to the remote directly
 * - Send individual records to the remote via record.send()
 */

import { Enbox, repository } from '@enbox/api';
import {
  ProfileProtocol,
  ConnectProtocol,
} from '@enbox/protocols';

import type { EnboxAgent } from '../types';
import { IDENTITY_SYNC_PROTOCOLS, installProtocols } from '../protocols';
import { ensureRegistration } from '../registration';
import { DEFAULT_DWN_ENDPOINTS, WALLET_URL } from '@/lib/dwn-endpoints';

async function registerIdentityForSync(agent: EnboxAgent, did: string): Promise<void> {
  try {
    await agent.sync.registerIdentity({
      did,
      options: { protocols: IDENTITY_SYNC_PROTOCOLS },
    });
  } catch {
    // Already registered
  }
}

function assertDhtDidPublished(identity: any): void {
  const did = identity?.did?.uri;
  if (typeof did !== 'string' || !did.startsWith('did:dht:')) {
    return;
  }

  if (identity?.did?.metadata?.published === false) {
    throw new Error(`Failed to publish DID ${did} to the DHT gateway`);
  }
}

async function deleteLocalIdentityBestEffort(agent: EnboxAgent, did: string): Promise<void> {
  try {
    await agent.sync.unregisterIdentity(did);
  } catch {
    // The identity may not have been registered for sync yet.
  }

  try {
    await agent.identity.delete({ didUri: did });
  } catch {
    // Best-effort cleanup only.
  }

  try {
    await agent.did.delete({ didUri: did, tenant: agent.agentDid.uri });
  } catch {
    // Best-effort cleanup only.
  }
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
  let identity: any | undefined;

  // 1. Create the DID + identity
  try {
    identity = await agent.identity.create({
      store: true,
      didMethod: 'dht',
      didOptions: {
        services: [
          {
            id: 'dwn',
            type: 'DecentralizedWebNode',
            serviceEndpoint: params.dwnEndpoints,
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
    });

    const did: string = identity.did.uri;
    assertDhtDidPublished(identity);

    // 2. Register identity as DWN tenant on remote endpoints.
    //    Must happen before sync registration — with live sync active,
    //    registerIdentity hot-adds a subscription that requires the DID
    //    to be a recognised tenant on the remote DWN.
    await ensureRegistration(agent, params.dwnEndpoints);

    // 3. Install protocols locally and on every configured DWN endpoint before
    //    registering live sync. This avoids a race where independent per-protocol
    //    sync links push Profile before SocialGraph on a fresh remote tenant.
    await installProtocols(agent, did, params.dwnEndpoints);
  } catch (error) {
    const did = identity?.did?.uri;
    if (did) {
      await deleteLocalIdentityBestEffort(agent, did);
    }
    throw error;
  }

  const did: string = identity.did.uri;

  // 4. Register identity DID for sync after protocol bootstrap is complete.
  await registerIdentityForSync(agent, did);

  // 5. Set profile social data
  const enbox = new Enbox({ agent, connectedDid: did });
  const repo = repository(enbox.using(ProfileProtocol));

  const socialData = {
    displayName: params.displayName,
    ...(params.tagline && { tagline: params.tagline }),
    ...(params.bio && { bio: params.bio }),
  };

  const { record: profileRecord } = await repo.profile.set({
    data: socialData,
    published: true,
  });
  await profileRecord!.send();

  // 6. Set avatar if provided
  if (params.avatar && profileRecord) {
    const ctxId = profileRecord.contextId as string;
    const { record: avatarRecord } = await repo.profile.avatar.set(ctxId, {
      data: params.avatar,
    });
    await avatarRecord!.send();
  }

  // 7. Set hero if provided
  if (params.hero && profileRecord) {
    const ctxId = profileRecord.contextId as string;
    const { record: heroRecord } = await repo.profile.hero.set(ctxId, {
      data: params.hero,
    });
    await heroRecord!.send();
  }

  // 8. Create wallet record
  try {
    const connect = enbox.using(ConnectProtocol);
    const { records: existingWallets } = await connect.records.query('wallet');
    if (existingWallets.length === 0) {
      const { record: walletRecord } = await connect.records.create('wallet', {
        data: { webWallets: [WALLET_URL] },
      });
      await walletRecord!.send();
    }
  } catch (err) {
    console.warn('Failed to create wallet record:', err);
  }

  return identity;
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
  if (params.persona) {
    await agent.identity.setMetadataName({
      didUri: params.did,
      name: params.persona,
    });
  }

  const enbox = new Enbox({ agent, connectedDid: params.did });
  const repo = repository(enbox.using(ProfileProtocol));

  const socialData = {
    displayName: params.displayName,
    ...(params.tagline !== undefined && { tagline: params.tagline }),
    ...(params.bio !== undefined && { bio: params.bio }),
  };

  const { record: profileRecord } = await repo.profile.set({
    data: socialData,
    published: true,
  });
  await profileRecord!.send();

  const ctxId = profileRecord?.contextId as string | undefined;

  if (params.avatar !== undefined && ctxId) {
    if (params.avatar) {
      const { record: avatarRecord } = await repo.profile.avatar.set(ctxId, {
        data: params.avatar,
      });
      await avatarRecord!.send();
    } else {
      const existing = await repo.profile.avatar.get(ctxId);
      if (existing) {
        await existing.delete();
        await existing.send();
      }
    }
  }

  if (params.hero !== undefined && ctxId) {
    if (params.hero) {
      const { record: heroRecord } = await repo.profile.hero.set(ctxId, {
        data: params.hero,
      });
      await heroRecord!.send();
    } else {
      const existing = await repo.profile.hero.get(ctxId);
      if (existing) {
        await existing.delete();
        await existing.send();
      }
    }
  }
}

// ── Delete identity ────────────────────────────────────────────────

export async function deleteIdentity(agent: EnboxAgent, did: string) {
  const identity = await agent.identity.get({ didUri: did });
  if (!identity) throw new Error('Identity not found');

  try {
    await agent.sync.unregisterIdentity(did);
  } catch {
    // May not be registered
  }
  await agent.identity.delete({ didUri: did });
  await agent.did.delete({ didUri: did, tenant: agent.agentDid.uri });
}

// ── Export identity ────────────────────────────────────────────────

export async function exportIdentity(agent: EnboxAgent, did: string) {
  const identity = await agent.identity.get({ didUri: did });
  if (!identity) throw new Error('Identity not found');
  return identity.export();
}

// ── Import identity ────────────────────────────────────────────────

export async function importIdentity(
  agent: EnboxAgent,
  portableIdentity: any,  
) {
  const existing = await agent.identity.get({
    didUri: portableIdentity.portableDid?.uri,
  });
  if (existing) throw new Error('Identity already exists');

  const identity = await agent.identity.import({ portableIdentity });
  const did = identity.did.uri;

  try {
    // Register imported identity as DWN tenant before sync (same reason as createIdentity)
    await ensureRegistration(agent, DEFAULT_DWN_ENDPOINTS);

    // Install protocols before registering sync so composed protocols are
    // present on every remote endpoint before live record replication starts.
    await installProtocols(agent, did, DEFAULT_DWN_ENDPOINTS);
  } catch (error) {
    await deleteLocalIdentityBestEffort(agent, did);
    throw error;
  }

  // Register for sync
  await registerIdentityForSync(agent, did);

  // Create wallet record
  try {
    const enbox = new Enbox({ agent, connectedDid: did });
    const connect = enbox.using(ConnectProtocol);
    const { records: existingWallets } = await connect.records.query('wallet');
    if (existingWallets.length === 0) {
      const { record: walletRecord } = await connect.records.create('wallet', {
        data: { webWallets: [WALLET_URL] },
      });
      await walletRecord!.send();
    }
  } catch (err) {
    console.warn('Failed to create wallet record on import:', err);
  }

  return identity;
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
  await agent.identity.setDwnEndpoints({
    didUri: params.did,
    endpoints: params.endpoints,
  });
}
