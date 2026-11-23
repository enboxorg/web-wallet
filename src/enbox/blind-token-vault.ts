import {
  type BlindToken,
  BlindTokenHttpError,
  chooseStorageUnit,
  claimInvite,
  type DidPopAgentLike,
  type DwnRegistrationBlindTokenResult,
  exchangeTokens,
  fetchMintConfig,
  type MintConfigDocument,
  normalizeBaseUrl,
  parseKeyId,
  postBlindTokenRegistration,
  resolveMintUrl,
  selectMintInputs,
  type ServerBlindTokenDescriptor,
} from '@/lib/blind-tokens';

export const BLIND_TOKENS_SECRET_KEY = 'enbox:blind-tokens:v1';

export interface StoredBlindToken extends BlindToken {
  credits: number;
  addedAt: string;
  notAfter?: string;
  redeemBefore?: string;
}

export interface BlindTokenVaultData {
  version: 1;
  mintUrl: string;
  mintCredits: StoredBlindToken[];
  serviceTokens: Record<string, StoredBlindToken[]>;
}

export interface VaultDenominationSummary {
  unit: string;
  count: number;
  creditsPerToken: number;
  totalCredits: number;
}

export interface BlindTokenVaultSummary {
  mintUrl: string;
  totalCredits: number;
  mintTokenCount: number;
  expiredMintTokenCount: number;
  denominations: VaultDenominationSummary[];
  serviceTokenCounts: Record<string, { count: number; totalCredits: number }>;
  totalServiceTokenCount: number;
}

export interface BlindTokenVaultAgent extends DidPopAgentLike {
  secrets?: {
    get(key: string): Promise<Uint8Array | undefined>;
    put(key: string, value: Uint8Array): Promise<void>;
  };
}

const vaultLocks = new WeakMap<object, Promise<unknown>>();
const inFlightTokens = new WeakMap<object, Set<string>>();

function tokenIdentityKey(token: Pick<BlindToken, 'kid' | 'msg'>): string {
  return `${token.kid}:${token.msg}`;
}

function getInFlightSet(agent: object): Set<string> {
  let set = inFlightTokens.get(agent);
  if (!set) {
    set = new Set<string>();
    inFlightTokens.set(agent, set);
  }
  return set;
}

function withVaultLock<T>(agent: BlindTokenVaultAgent, work: () => Promise<T>): Promise<T> {
  const previous = vaultLocks.get(agent) ?? Promise.resolve();
  const next = previous.then(work, work);
  const settled = next.then(
    () => undefined,
    () => undefined,
  );
  vaultLocks.set(agent, settled);
  return next;
}

function hasEncryptedSecrets(agent: BlindTokenVaultAgent | null | undefined): boolean {
  return typeof agent?.secrets?.get === 'function' && typeof agent?.secrets?.put === 'function';
}

function createEmptyVault(mintUrl?: string): BlindTokenVaultData {
  return {
    version: 1,
    mintUrl: resolveMintUrl(undefined, mintUrl),
    mintCredits: [],
    serviceTokens: {},
  };
}

function isTokenExpired(token: Pick<StoredBlindToken, 'redeemBefore'>, nowMs: number): boolean {
  if (!token.redeemBefore) {
    return false;
  }
  const expiresMs = Date.parse(token.redeemBefore);
  return Number.isFinite(expiresMs) && expiresMs <= nowMs;
}

function normalizeStoredToken(raw: unknown): StoredBlindToken | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<StoredBlindToken>;
  if (
    typeof candidate.kid !== 'string' ||
    typeof candidate.msg !== 'string' ||
    typeof candidate.sig !== 'string' ||
    typeof candidate.credits !== 'number' ||
    !Number.isFinite(candidate.credits) ||
    candidate.credits <= 0
  ) {
    return null;
  }
  return {
    kid: candidate.kid,
    msg: candidate.msg,
    sig: candidate.sig,
    credits: candidate.credits,
    addedAt: typeof candidate.addedAt === 'string' ? candidate.addedAt : new Date().toISOString(),
    ...(typeof candidate.notAfter === 'string' ? { notAfter: candidate.notAfter } : {}),
    ...(typeof candidate.redeemBefore === 'string' ? { redeemBefore: candidate.redeemBefore } : {}),
  };
}

function parseVaultBytes(bytes: Uint8Array | undefined): BlindTokenVaultData {
  if (!bytes || bytes.byteLength === 0) {
    return createEmptyVault();
  }
  const decoded = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(decoded) as Partial<BlindTokenVaultData>;
  if (parsed.version !== 1) {
    throw new Error(`Unsupported blind-token vault version: ${String(parsed.version)}`);
  }
  const mintCredits = Array.isArray(parsed.mintCredits)
    ? parsed.mintCredits.map(normalizeStoredToken).filter((t): t is StoredBlindToken => t !== null)
    : [];

  const serviceTokens: Record<string, StoredBlindToken[]> = {};
  if (parsed.serviceTokens && typeof parsed.serviceTokens === 'object') {
    for (const [aud, list] of Object.entries(parsed.serviceTokens)) {
      if (!Array.isArray(list)) continue;
      const validList = list.map(normalizeStoredToken).filter((t): t is StoredBlindToken => t !== null);
      if (validList.length > 0) {
        serviceTokens[aud] = validList;
      }
    }
  }

  return {
    version: 1,
    mintUrl: resolveMintUrl(undefined, typeof parsed.mintUrl === 'string' ? parsed.mintUrl : undefined),
    mintCredits,
    serviceTokens,
  };
}

function enrichTokensWithConfig(
  tokens: readonly BlindToken[],
  config: MintConfigDocument,
  addedAt: string = new Date().toISOString(),
): StoredBlindToken[] {
  const keyMap = new Map(config.keys.map((k) => [k.kid, k]));
  const denomMap = new Map(config.mintDenominations.map((d) => [d.unit, d.credits]));
  const tariffMap = new Map(config.tariffs.map((t) => [`${t.aud}:${t.unit}`, t.credits]));

  return tokens.map((token) => {
    const parsed = parseKeyId(token.kid);
    const keyMeta = keyMap.get(token.kid);
    const credits =
      parsed?.aud === 'mint'
        ? (denomMap.get(parsed.unit) ?? 1)
        : parsed
          ? (tariffMap.get(`${parsed.aud}:${parsed.unit}`) ?? 1)
          : 1;

    return {
      ...token,
      credits,
      addedAt,
      ...(keyMeta ? { notAfter: keyMeta.notAfter, redeemBefore: keyMeta.redeemBefore } : {}),
    };
  });
}

export async function loadBlindTokenVault(agent: BlindTokenVaultAgent): Promise<BlindTokenVaultData> {
  if (!hasEncryptedSecrets(agent)) {
    return createEmptyVault();
  }
  const bytes = await agent.secrets!.get(BLIND_TOKENS_SECRET_KEY);
  return parseVaultBytes(bytes);
}

export async function saveBlindTokenVault(
  agent: BlindTokenVaultAgent,
  vault: BlindTokenVaultData,
): Promise<void> {
  if (!hasEncryptedSecrets(agent)) {
    throw new Error('Encrypted agent secrets store is unavailable for blind tokens');
  }
  const encoded = new TextEncoder().encode(JSON.stringify(vault));
  await agent.secrets!.put(BLIND_TOKENS_SECRET_KEY, encoded);
}

export function addMintCredits(
  vault: BlindTokenVaultData,
  tokens: readonly StoredBlindToken[],
  mintUrl?: string,
): BlindTokenVaultData {
  return {
    ...vault,
    mintUrl: mintUrl ? resolveMintUrl(undefined, mintUrl) : vault.mintUrl,
    mintCredits: [...vault.mintCredits, ...tokens],
  };
}

export function summarizeBlindTokenVault(
  vault: BlindTokenVaultData,
  nowMs: number = Date.now(),
): BlindTokenVaultSummary {
  const byUnit = new Map<string, VaultDenominationSummary>();
  let totalCredits = 0;
  let mintTokenCount = 0;
  let expiredMintTokenCount = 0;

  for (const token of vault.mintCredits) {
    if (isTokenExpired(token, nowMs)) {
      expiredMintTokenCount += 1;
      continue;
    }
    mintTokenCount += 1;
    totalCredits += token.credits;
    const unit = parseKeyId(token.kid)?.unit ?? `c${token.credits}`;
    const existing = byUnit.get(unit);
    if (existing) {
      existing.count += 1;
      existing.totalCredits += token.credits;
    } else {
      byUnit.set(unit, {
        unit,
        count: 1,
        creditsPerToken: token.credits,
        totalCredits: token.credits,
      });
    }
  }

  const denominations = [...byUnit.values()].sort((a, b) => b.creditsPerToken - a.creditsPerToken);
  const serviceTokenCounts: Record<string, { count: number; totalCredits: number }> = {};
  let totalServiceTokenCount = 0;

  for (const [aud, list] of Object.entries(vault.serviceTokens)) {
    const activeList = list.filter((t) => !isTokenExpired(t, nowMs));
    if (activeList.length === 0) continue;
    serviceTokenCounts[aud] = {
      count: activeList.length,
      totalCredits: activeList.reduce((sum, t) => sum + t.credits, 0),
    };
    totalServiceTokenCount += activeList.length;
  }

  return {
    mintUrl: vault.mintUrl,
    totalCredits,
    mintTokenCount,
    expiredMintTokenCount,
    denominations,
    serviceTokenCounts,
    totalServiceTokenCount,
  };
}

export async function getVaultSummary(
  agent: BlindTokenVaultAgent,
  nowMs: number = Date.now(),
): Promise<BlindTokenVaultSummary> {
  const vault = await loadBlindTokenVault(agent);
  return summarizeBlindTokenVault(vault, nowMs);
}

export async function hasCreditsForEndpoint(
  agent: BlindTokenVaultAgent | null | undefined,
  descriptor?: ServerBlindTokenDescriptor,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!agent || !hasEncryptedSecrets(agent) || !descriptor) {
    return false;
  }

  try {
    const vault = await loadBlindTokenVault(agent);
    const inFlight = getInFlightSet(agent);
    const supportedUnits = new Set(descriptor.units.map((u) => u.unit));
    const heldService = vault.serviceTokens[descriptor.audience] ?? [];
    const hasService = heldService.some((token) => {
      if (isTokenExpired(token, nowMs) || inFlight.has(tokenIdentityKey(token))) {
        return false;
      }
      const parsed = parseKeyId(token.kid);
      return parsed !== null && (supportedUnits.size === 0 || supportedUnits.has(parsed.unit));
    });
    if (hasService) {
      return true;
    }

    return vault.mintCredits.some((token) => !isTokenExpired(token, nowMs));
  } catch {
    return false;
  }
}

export async function claimAndStoreInvite(
  agent: BlindTokenVaultAgent,
  params: {
    inviteCode: string;
    mintUrl?: string;
    fetchFn?: typeof fetch;
  },
): Promise<{
  addedCredits: number;
  tokens: StoredBlindToken[];
  summary: BlindTokenVaultSummary;
}> {
  if (!hasEncryptedSecrets(agent)) {
    throw new Error('Unlock your wallet before claiming invite credits');
  }

  return withVaultLock(agent, async () => {
    const vault = await loadBlindTokenVault(agent);
    const mintUrl = resolveMintUrl(undefined, params.mintUrl || vault.mintUrl);
    const result = await claimInvite({
      mintUrl,
      inviteCode: params.inviteCode,
      fetchFn: params.fetchFn,
    });
    const stored = enrichTokensWithConfig(result.tokens, result.config);
    const updated = addMintCredits(vault, stored, mintUrl);
    await saveBlindTokenVault(agent, updated);
    return {
      addedCredits: result.credits,
      tokens: stored,
      summary: summarizeBlindTokenVault(updated),
    };
  });
}

export async function refreshMintCredits(
  agent: BlindTokenVaultAgent,
  params?: {
    mintUrl?: string;
    fetchFn?: typeof fetch;
    nowMs?: number;
  },
): Promise<BlindTokenVaultSummary> {
  if (!hasEncryptedSecrets(agent)) {
    throw new Error('Unlock your wallet before refreshing credits');
  }

  return withVaultLock(agent, async () => {
    const nowMs = params?.nowMs ?? Date.now();
    const vault = await loadBlindTokenVault(agent);
    const mintUrl = resolveMintUrl(undefined, params?.mintUrl || vault.mintUrl);
    const fetchFn = params?.fetchFn ?? fetch;

    const validMint = vault.mintCredits.filter((t) => !isTokenExpired(t, nowMs));
    const prunedExpiredService: Record<string, StoredBlindToken[]> = {};
    for (const [aud, list] of Object.entries(vault.serviceTokens)) {
      const validList = list.filter((t) => !isTokenExpired(t, nowMs));
      if (validList.length > 0) {
        prunedExpiredService[aud] = validList;
      }
    }

    if (validMint.length === 0) {
      const cleaned: BlindTokenVaultData = {
        ...vault,
        mintUrl,
        mintCredits: [],
        serviceTokens: prunedExpiredService,
      };
      await saveBlindTokenVault(agent, cleaned);
      return summarizeBlindTokenVault(cleaned, nowMs);
    }

    const config = await fetchMintConfig(mintUrl, fetchFn);
    const { change } = await exchangeTokens({
      mintUrl,
      inputs: validMint,
      targetOutputs: [],
      config,
      fetchFn,
    });

    const refreshed = enrichTokensWithConfig(change, config);
    const nextVault: BlindTokenVaultData = {
      version: 1,
      mintUrl,
      mintCredits: refreshed,
      serviceTokens: prunedExpiredService,
    };
    await saveBlindTokenVault(agent, nextVault);
    return summarizeBlindTokenVault(nextVault, nowMs);
  });
}

export async function markServiceTokensSpent(
  agent: BlindTokenVaultAgent,
  audience: string,
  spentTokens: readonly Pick<BlindToken, 'kid' | 'msg'>[],
): Promise<void> {
  const inFlight = getInFlightSet(agent);
  for (const token of spentTokens) {
    inFlight.delete(tokenIdentityKey(token));
  }

  if (!hasEncryptedSecrets(agent) || spentTokens.length === 0) {
    return;
  }

  const spentKeys = new Set(spentTokens.map(tokenIdentityKey));
  await withVaultLock(agent, async () => {
    const vault = await loadBlindTokenVault(agent);
    const existing = vault.serviceTokens[audience];
    if (!existing || existing.length === 0) {
      return;
    }
    const remaining = existing.filter((token) => !spentKeys.has(tokenIdentityKey(token)));
    const nextServiceTokens = { ...vault.serviceTokens };
    if (remaining.length > 0) {
      nextServiceTokens[audience] = remaining;
    } else {
      delete nextServiceTokens[audience];
    }
    await saveBlindTokenVault(agent, {
      ...vault,
      serviceTokens: nextServiceTokens,
    });
  });
}

export async function acquireServiceTokens(
  agent: BlindTokenVaultAgent,
  params: {
    audience: string;
    unit: string;
    count?: number;
    mintUrl?: string;
    config?: MintConfigDocument;
    fetchFn?: typeof fetch;
    nowMs?: number;
  },
): Promise<{
  tokens: StoredBlindToken[];
  releaseInFlight: () => void;
  markSpent: () => Promise<void>;
}> {
  if (!hasEncryptedSecrets(agent)) {
    throw new Error('Encrypted agent secrets store is unavailable');
  }
  const count = params.count ?? 1;
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Token count must be a positive integer, received ${count}`);
  }

  const inFlight = getInFlightSet(agent);

  const tokens = await withVaultLock(agent, async () => {
    const nowMs = params.nowMs ?? Date.now();
    const vault = await loadBlindTokenVault(agent);
    const existingBucket = vault.serviceTokens[params.audience] ?? [];

    const reused: StoredBlindToken[] = [];
    for (const token of existingBucket) {
      if (reused.length >= count) break;
      if (isTokenExpired(token, nowMs)) continue;
      if (inFlight.has(tokenIdentityKey(token))) continue;
      const parsed = parseKeyId(token.kid);
      if (parsed?.unit === params.unit) {
        reused.push(token);
      }
    }

    const needed = count - reused.length;
    let acquired: StoredBlindToken[] = [...reused];

    if (needed > 0) {
      const fetchFn = params.fetchFn ?? fetch;
      const mintUrl = resolveMintUrl(undefined, params.mintUrl || vault.mintUrl);
      const config = params.config ?? (await fetchMintConfig(mintUrl, fetchFn));
      const tariff = config.tariffs.find((t) => t.aud === params.audience && t.unit === params.unit);
      if (!tariff) {
        throw new Error(`No mint tariff found for ${params.audience}:${params.unit}`);
      }

      const validMint = vault.mintCredits.filter((t) => !isTokenExpired(t, nowMs));
      const selectedInputs = selectMintInputs(
        validMint,
        tariff.credits * needed,
        config.mintDenominations,
      );

      const { tokens: mintedTarget, change } = await exchangeTokens({
        mintUrl,
        inputs: selectedInputs,
        targetOutputs: [{ aud: params.audience, unit: params.unit, count: needed }],
        config,
        fetchFn,
      });

      const consumedKeys = new Set(selectedInputs.map(tokenIdentityKey));
      const remainingMint = validMint.filter((t) => !consumedKeys.has(tokenIdentityKey(t)));
      const storedChange = enrichTokensWithConfig(change, config);
      const storedTarget = enrichTokensWithConfig(mintedTarget, config);

      const nextBucket = [
        ...existingBucket.filter((t) => !isTokenExpired(t, nowMs)),
        ...storedTarget,
      ];

      await saveBlindTokenVault(agent, {
        version: 1,
        mintUrl,
        mintCredits: [...remainingMint, ...storedChange],
        serviceTokens: {
          ...vault.serviceTokens,
          [params.audience]: nextBucket,
        },
      });

      acquired = [...reused, ...storedTarget];
    }

    for (const token of acquired) {
      inFlight.add(tokenIdentityKey(token));
    }
    return acquired;
  });

  return {
    tokens,
    releaseInFlight: () => {
      for (const token of tokens) {
        inFlight.delete(tokenIdentityKey(token));
      }
    },
    markSpent: () => markServiceTokensSpent(agent, params.audience, tokens),
  };
}

export async function redeemStorageBlockForDid(
  agent: BlindTokenVaultAgent,
  params: {
    did: string;
    endpoint: string;
    descriptor: ServerBlindTokenDescriptor;
    count?: number;
    fetchFn?: typeof fetch;
  },
): Promise<{
  registration: DwnRegistrationBlindTokenResult;
  unit: string;
  grantedBytes: number;
  durationSeconds: number;
}> {
  const fetchFn = params.fetchFn ?? fetch;
  const vault = await loadBlindTokenVault(agent);
  const mintUrl = resolveMintUrl(params.descriptor.issuerUrls, vault.mintUrl);
  const config = await fetchMintConfig(mintUrl, fetchFn);
  const { tariff, unitSpec } = chooseStorageUnit(config, params.descriptor);
  const count = params.count ?? 1;

  const acquired = await acquireServiceTokens(agent, {
    audience: params.descriptor.audience,
    unit: tariff.unit,
    count,
    mintUrl,
    config,
    fetchFn,
  });

  const registrationUrl =
    params.descriptor.registrationUrl || `${normalizeBaseUrl(params.endpoint)}/registration`;

  try {
    const registration = await postBlindTokenRegistration({
      registrationUrl,
      did: params.did,
      blindTokens: acquired.tokens.map(({ kid, msg, sig }) => ({ kid, msg, sig })),
      fetchFn,
    });

    await acquired.markSpent();

    return {
      registration,
      unit: unitSpec.unit,
      grantedBytes: registration.grantedBytes ?? unitSpec.bytes * count,
      durationSeconds: unitSpec.durationSeconds,
    };
  } catch (error) {
    // Only discard already-spent service tokens on 409 TokenAlreadySpent.
    // Transient 5xx/network failures retain unspent serviceTokens for safe retry.
    if (error instanceof BlindTokenHttpError && error.status === 409) {
      await acquired.markSpent();
    } else {
      acquired.releaseInFlight();
    }
    throw error;
  }
}
