/**
 * Query functions for fetching identity-related data from the Enbox SDK.
 *
 * These are **pure async functions** — not hooks — so they can be used
 * directly inside TanStack Query `queryFn` callbacks.
 */

import { DwnApi } from '@enbox/api/advanced';
import { Enbox, repository } from '@enbox/api';
import { ConnectProtocol, ProfileProtocol } from '@enbox/protocols';
import { getDwnServiceEndpointUrls } from '@enbox/agent';

import type { EnboxAgent, IdentityProfile } from '../types';

// ── Identity list ──────────────────────────────────────────────────

/** List all identities managed by the agent. Returns `BearerIdentity[]`. */
export async function fetchIdentities(agent: EnboxAgent) {
  const identities = await agent.identity.list();
  return identities;
}

// ── Profile ────────────────────────────────────────────────────────

/**
 * Resolve the full profile for a DID: social data, avatar blob URL,
 * and hero blob URL.
 *
 * Callers are responsible for revoking the returned object URLs when
 * they are no longer needed.
 */
export async function fetchProfile(
  agent: EnboxAgent,
  did: string,
): Promise<IdentityProfile> {
  const enbox = new Enbox({ agent, connectedDid: did });
  const repo = repository(enbox.using(ProfileProtocol));

  const profileRecord = await repo.profile.get();

  let socialData: { displayName: string; tagline?: string; bio?: string } = {
    displayName: '',
  };
  let avatarUrl: string | undefined;
  let heroUrl: string | undefined;

  if (profileRecord) {
    socialData = await profileRecord.data.json();

    // Avatar
    const contextId = profileRecord.contextId as string;
    const avatarRecord = await repo.profile.avatar.get(contextId);
    if (avatarRecord) {
      const blob: Blob = await avatarRecord.data.blob();
      avatarUrl = URL.createObjectURL(blob);
    }

    // Hero image
    const heroRecord = await repo.profile.hero.get(contextId);
    if (heroRecord) {
      const blob: Blob = await heroRecord.data.blob();
      heroUrl = URL.createObjectURL(blob);
    }
  }

  return {
    did,
    displayName: socialData.displayName,
    tagline: socialData.tagline,
    bio: socialData.bio,
    avatarUrl,
    heroUrl,
  };
}

// ── Protocols ──────────────────────────────────────────────────────

/** Installed protocol definitions for the given DID. */
export async function fetchProtocols(agent: EnboxAgent, did: string) {
  const dwn = new DwnApi({ agent, connectedDid: did });
  const { protocols } = await dwn.protocols.query({});
  return protocols.map((p: any) => ({
    uri: p.definition.protocol as string,
    published: (p.definition.published ?? false) as boolean,
    definition: p.definition,
  }));
}

// ── Permissions ────────────────────────────────────────────────────

/** Permission grants stored in the DWN for the given DID. */
export async function fetchPermissions(agent: EnboxAgent, did: string) {
  const dwn = new DwnApi({ agent, connectedDid: did });
  const grants = await dwn.permissions.queryGrants();
  return grants;
}

// ── Wallets ────────────────────────────────────────────────────────

/** Wallet records stored via the Connect protocol. */
export async function fetchWallets(agent: EnboxAgent, did: string) {
  const enbox = new Enbox({ agent, connectedDid: did });
  const connect = enbox.using(ConnectProtocol);
  const { records } = await connect.records.query('wallet');
  const wallets = await Promise.all(
    records.map(async (r: any) => {
      const data = await r.data.json();
      return data;
    }),
  );
  return wallets;
}

// ── DWN endpoints ──────────────────────────────────────────────────

/** Resolve the DWN service endpoint URLs from the DID document. */
export async function fetchDwnEndpoints(agent: EnboxAgent, did: string) {
  return getDwnServiceEndpointUrls(did, agent.did);
}

// ── Activity ───────────────────────────────────────────────────────

export interface ActivityRecord {
  id: string;
  protocol?: string;
  protocolPath?: string;
  schema?: string;
  dataFormat?: string;
  dateCreated: string;
  author: string;
  published?: boolean;
}

/** Recent records created in the last 7 days, sorted newest-first. */
export async function fetchActivity(
  agent: EnboxAgent,
  did: string,
  limit = 50,
): Promise<ActivityRecord[]> {
  const dwn = new DwnApi({ agent, connectedDid: did });
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { records } = await dwn.records.query({
    filter: { dateCreated: { from: oneWeekAgo } },
    dateSort: 'createdDescending' as any,  
    pagination: { limit },
  });

  return records.map((r: any) => ({
    id: r.id,
    protocol: r.protocol,
    protocolPath: r.protocolPath,
    schema: r.schema,
    dataFormat: r.dataFormat,
    dateCreated: r.dateCreated,
    author: r.author,
    published: r.published,
  }));
}
