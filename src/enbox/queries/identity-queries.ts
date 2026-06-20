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

// ── Blob URL lifecycle management ──────────────────────────────────

type ProfileImageSlot = 'avatar' | 'hero';
type ProfileImageRecord = {
  id?: unknown;
  dataCid?: unknown;
  dataSize?: unknown;
  timestamp?: unknown;
  data: { blob(): Promise<Blob> };
};
type CachedProfileImageUrl = {
  key: string;
  url: string;
};

const _profileImageUrls = new Map<string, Partial<Record<ProfileImageSlot, CachedProfileImageUrl>>>();
const BLOB_URL_REVOKE_DELAY_MS = 60_000;

function imageRecordCacheKey(record: ProfileImageRecord): string {
  return [record.id, record.dataCid, record.dataSize, record.timestamp]
    .filter((part): part is string | number =>
      typeof part === 'string' || typeof part === 'number'
    )
    .join('|');
}

function revokeObjectUrlLater(url: string): void {
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort cleanup only.
    }
  }, BLOB_URL_REVOKE_DELAY_MS);
}

function setCachedImageUrl(
  did: string,
  slot: ProfileImageSlot,
  next: CachedProfileImageUrl,
): void {
  const cache = _profileImageUrls.get(did) ?? {};
  const previous = cache[slot];

  cache[slot] = next;
  _profileImageUrls.set(did, cache);

  if (previous && previous.url !== next.url) {
    revokeObjectUrlLater(previous.url);
  }
}

function clearCachedImageUrl(did: string, slot: ProfileImageSlot): void {
  const cache = _profileImageUrls.get(did);
  const previous = cache?.[slot];
  if (!cache || !previous) {
    return;
  }

  delete cache[slot];
  if (!cache.avatar && !cache.hero) {
    _profileImageUrls.delete(did);
  }
  revokeObjectUrlLater(previous.url);
}

async function getCachedImageUrl(
  did: string,
  slot: ProfileImageSlot,
  record: ProfileImageRecord,
): Promise<string> {
  const key = imageRecordCacheKey(record);
  const cached = _profileImageUrls.get(did)?.[slot];

  if (key && cached?.key === key) {
    return cached.url;
  }

  const blob = await record.data.blob();
  const url = URL.createObjectURL(blob);
  setCachedImageUrl(did, slot, { key: key || url, url });
  return url;
}

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
 * Profile image object URLs are cached by DID and image record so React can
 * safely render across query refetches without losing the underlying blob.
 */
export async function fetchProfile(
  agent: EnboxAgent,
  did: string,
): Promise<IdentityProfile> {
  const enbox = new Enbox({ agent, connectedDid: did });
  const repo = repository(enbox.using(ProfileProtocol));

  const profileRecord = await repo.profile.get();
  const hasProfileRecord = profileRecord !== undefined;

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
      avatarUrl = await getCachedImageUrl(did, 'avatar', avatarRecord);
    } else {
      clearCachedImageUrl(did, 'avatar');
    }

    // Hero image
    const heroRecord = await repo.profile.hero.get(contextId);
    if (heroRecord) {
      heroUrl = await getCachedImageUrl(did, 'hero', heroRecord);
    } else {
      clearCachedImageUrl(did, 'hero');
    }
  } else {
    clearCachedImageUrl(did, 'avatar');
    clearCachedImageUrl(did, 'hero');
  }

  return {
    did,
    displayName: socialData.displayName,
    tagline: socialData.tagline,
    bio: socialData.bio,
    avatarUrl,
    heroUrl,
    hasProfileRecord,
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

/** Recent records sorted newest-first. */
export async function fetchActivity(
  agent: EnboxAgent,
  did: string,
  limit = 50,
): Promise<ActivityRecord[]> {
  const dwn = new DwnApi({ agent, connectedDid: did });

  const { records } = await dwn.records.query({
    filter: {},
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
