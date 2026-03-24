/**
 * Mutation functions for identity CRUD operations.
 *
 * These are pure async functions consumed by TanStack Query `useMutation`.
 * They orchestrate the Enbox SDK calls for creating, updating, deleting,
 * importing, and exporting identities.
 */

import { Enbox, repository } from '@enbox/api';
import {
  ProfileProtocol,
  ConnectProtocol,
  ProfileDefinition,
  SocialGraphDefinition,
  ConnectDefinition,
} from '@enbox/protocols';

import type { EnboxAgent } from '../types';
import { installProtocols } from '../protocols';
import { ensureRegistration } from '../registration';
import { WALLET_URL } from '@/lib/dwn-endpoints';
import { SYNC_INTERVAL } from '@/lib/constants';

// ── Param types ────────────────────────────────────────────────────

export interface CreateIdentityParams {
  persona: string;
  displayName: string;
  tagline?: string;
  bio?: string;
  avatar?: Blob;
  hero?: Blob;
  dwnEndpoints: string[];
}

export interface UpdateIdentityProfileParams {
  did: string;
  persona?: string;
  displayName: string;
  tagline?: string;
  bio?: string;
  /** Blob = update, null = delete, undefined = no change */
  avatar?: Blob | null;
  /** Blob = update, null = delete, undefined = no change */
  hero?: Blob | null;
}

export interface UpdateDwnEndpointsParams {
  did: string;
  endpoints: string[];
}

// ── Create ─────────────────────────────────────────────────────────

/** Create a brand-new identity with profile, protocols, and sync. */
export async function createIdentity(
  agent: EnboxAgent,
  params: CreateIdentityParams,
) {
  // 1. Create the DID + identity
  const identity = await agent.identity.create({
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

  // 2. Register for DWN sync with protocol-specific filters
  await agent.sync.registerIdentity({
    did,
    options: {
      protocols: [
        SocialGraphDefinition.protocol,
        ProfileDefinition.protocol,
        ConnectDefinition.protocol,
      ],
    },
  });

  // 3. Register identity with DWN endpoints
  await ensureRegistration(agent, params.dwnEndpoints);

  // 4. Stop sync, do initial pull, then install protocols.
  // installProtocols() sends each protocol to the remote DWN sequentially
  // in dependency order (SocialGraph before Profile) via protocol.send().
  // We do NOT do a sync push here — the sync engine pushes ProtocolsConfigure
  // messages without order guarantees, causing ComposedProtocolNotInstalled
  // errors when Profile arrives before SocialGraph on the remote.
  await agent.sync.stopSync();
  await agent.sync.sync('pull');
  await installProtocols(agent, did);

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

  // 7. Set avatar if provided
  if (params.avatar && profileRecord) {
    const ctxId = profileRecord.contextId as string;
    const { record: avatarRecord } = await repo.profile.avatar.set(ctxId, {
      data: params.avatar,
    });
    await avatarRecord!.send();
  }

  // 8. Set hero if provided
  if (params.hero && profileRecord) {
    const ctxId = profileRecord.contextId as string;
    const { record: heroRecord } = await repo.profile.hero.set(ctxId, {
      data: params.hero,
    });
    await heroRecord!.send();
  }

  // 9. Create wallet record via Connect protocol
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

  // 10. Restart sync
  await agent.sync.startSync({ mode: 'live', interval: SYNC_INTERVAL });

  return identity;
}

// ── Update profile ─────────────────────────────────────────────────

/** Update an existing identity's profile (social data, avatar, hero). */
export async function updateIdentityProfile(
  agent: EnboxAgent,
  params: UpdateIdentityProfileParams,
) {
  // Update metadata name if provided
  if (params.persona) {
    await agent.identity.setMetadataName({
      didUri: params.did,
      name: params.persona,
    });
  }

  // Update social data
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

  // Handle avatar: Blob = update, null = delete, undefined = no change
  if (params.avatar !== undefined && ctxId) {
    if (params.avatar) {
      const { record: avatarRecord } = await repo.profile.avatar.set(ctxId, {
        data: params.avatar,
      });
      await avatarRecord!.send();
    } else {
      // null -> delete existing avatar
      const existing = await repo.profile.avatar.get(ctxId);
      if (existing) {
        await existing.delete();
        await existing.send();
      }
    }
  }

  // Handle hero: same semantics as avatar
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

// ── Delete ─────────────────────────────────────────────────────────

/** Delete an identity, unregistering it from sync first. */
export async function deleteIdentity(agent: EnboxAgent, did: string) {
  const identity = await agent.identity.get({ didUri: did });
  if (!identity) throw new Error('Identity not found');

  await agent.sync.unregisterIdentity(did);
  await agent.identity.delete({ didUri: did });
  await agent.did.delete({ didUri: did, tenant: agent.agentDid.uri });
}

// ── Export ─────────────────────────────────────────────────────────

/** Export an identity to a portable JSON representation. */
export async function exportIdentity(agent: EnboxAgent, did: string) {
  const identity = await agent.identity.get({ didUri: did });
  if (!identity) throw new Error('Identity not found');
  return identity.export();
}

// ── Import ─────────────────────────────────────────────────────────

/**
 * Import an identity from a portable JSON blob.
 * Installs required protocols and registers for sync.
 */
export async function importIdentity(
  agent: EnboxAgent,
  /** Portable identity JSON (as returned by `exportIdentity`). */
  portableIdentity: any,  
) {
  // Guard against duplicates
  const existing = await agent.identity.get({
    didUri: portableIdentity.portableDid?.uri,
  });
  if (existing) throw new Error('Identity already exists');

  const identity = await agent.identity.import({ portableIdentity });
  const did: string = identity.did.uri;

  // Register for sync with protocol filters
  await agent.sync.registerIdentity({
    did,
    options: {
      protocols: [
        SocialGraphDefinition.protocol,
        ProfileDefinition.protocol,
        ConnectDefinition.protocol,
      ],
    },
  });

  // Stop sync, pull, install protocols (sends to remote in order), restart sync
  await agent.sync.stopSync();
  await agent.sync.sync('pull');
  await installProtocols(agent, did);

  // Create wallet record if none exists
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

  await agent.sync.startSync({ mode: 'live', interval: SYNC_INTERVAL });

  return identity;
}

// ── Update DWN endpoints ───────────────────────────────────────────

/** Update the DWN service endpoints in the DID document. */
export async function updateDwnEndpoints(
  agent: EnboxAgent,
  params: UpdateDwnEndpointsParams,
) {
  await agent.identity.setDwnEndpoints({
    didUri: params.did,
    endpoints: params.endpoints,
  });
}
