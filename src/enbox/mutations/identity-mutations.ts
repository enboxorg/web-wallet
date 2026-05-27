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
  SocialGraphDefinition,
  ProfileDefinition,
  ConnectDefinition,
} from '@enbox/protocols';

import type { EnboxAgent } from '../types';
import { installProtocols } from '../protocols';
import { ensureRegistration } from '../registration';
import { DEFAULT_DWN_ENDPOINTS, WALLET_URL } from '@/lib/dwn-endpoints';

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

  // 2. Register identity as DWN tenant on remote endpoints.
  await ensureRegistration(agent, params.dwnEndpoints);

  // 3. Install protocols locally and send to remote directly.
  //    This must happen BEFORE sync registration. With live sync active,
  //    registerIdentity hot-adds a subscription that immediately starts
  //    pushing local messages. If protocols haven't been sent to the
  //    remote yet, the sync engine pushes them out of dependency order
  //    (Profile before SocialGraph) → 400 "composed protocol not installed".
  await installProtocols(agent, did);

  // 4. Write profile data and send directly to remote.
  //    All records are written and sent before sync registration so the
  //    remote has everything by the time sync starts reconciling.
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

  if (params.avatar && profileRecord) {
    const ctxId = profileRecord.contextId as string;
    const { record: avatarRecord } = await repo.profile.avatar.set(ctxId, {
      data: params.avatar,
    });
    await avatarRecord!.send();
  }

  if (params.hero && profileRecord) {
    const ctxId = profileRecord.contextId as string;
    const { record: heroRecord } = await repo.profile.hero.set(ctxId, {
      data: params.hero,
    });
    await heroRecord!.send();
  }

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

  // 5. Register identity DID for sync LAST.
  //    By this point all protocols are installed and all records are sent
  //    to the remote. The sync engine's initial reconciliation finds
  //    everything in sync — no out-of-order pushes.
  try {
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
  } catch {
    // Already registered
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

  // Register as DWN tenant, install protocols, write records — all before
  // sync registration (same reasoning as createIdentity).
  await ensureRegistration(agent, DEFAULT_DWN_ENDPOINTS);
  await installProtocols(agent, did);

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

  // Register for sync last.
  try {
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
  } catch {
    // Already registered
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
