import { RSABSSA } from '@cloudflare/blindrsa-ts';

export const DEFAULT_MINT_URL = 'https://mint.enbox.id';
export const RSA_MODULUS_BYTES = 256;
export const RAW_TOKEN_BYTES = 32;
export const MAX_EXCHANGE_INPUTS = 32;
export const KID_REGEX = /^([a-z0-9-]+):([a-z0-9-]+):(\d{4}-Q[1-4])$/;

export interface ParsedKeyId {
  kid: string;
  aud: string;
  unit: string;
  epoch: string;
}

export interface BlindIssuerJwk {
  kty: 'RSA';
  n: string;
  e: string;
  alg: 'PS384';
  use: 'sig';
  kid: string;
  aud: string;
  unit: string;
  epoch: string;
  notAfter: string;
  redeemBefore: string;
  active: boolean;
}

export interface MintDenomination {
  unit: string;
  credits: number;
}

export interface TariffEntry {
  aud: string;
  unit: string;
  credits: number;
  description?: string;
}

export interface MintConfigDocument {
  version: 1;
  issuer: string;
  suite: 'RSABSSA-SHA384-PSS-Randomized';
  creditValueUsdCents: number;
  mintDenominations: MintDenomination[];
  tariffs: TariffEntry[];
  currentEpoch: string;
  keys: BlindIssuerJwk[];
  issuedAt: string;
}

export interface InvitePreview {
  valid: boolean;
  credits: number;
  remainingUses: number;
  expiresAt: string | null;
}

export interface BlindedRequestItem {
  kid: string;
  blindedMsg: string;
}

export interface BlindSignatureItem {
  kid: string;
  blindSig: string;
}

export interface BlindToken {
  kid: string;
  msg: string;
  sig: string;
}

export interface PreparedBlindState {
  kid: string;
  preparedMsg: Uint8Array;
  blindedMsg: Uint8Array;
  inv: Uint8Array;
}

export interface ExchangeTargetRequest {
  aud: string;
  unit: string;
  count?: number;
}

export interface StorageLeaseUnitSpec {
  unit: string;
  bytes: number;
  durationSeconds: number;
}

export interface ServerBlindTokenDescriptor {
  audience: string;
  issuerUrls: string[];
  units: StorageLeaseUnitSpec[];
  registrationUrl: string;
  quotaUrl: string;
}

export interface DwnStorageLease {
  leaseId: string;
  bytes: number;
  expiresAt: string;
  active: boolean;
}

export interface DwnQuotaResponse {
  did: string;
  registered: boolean;
  suspended: boolean;
  quotaEnforced: boolean;
  storage: {
    usedBytes: number;
    limitBytes: number;
    remainingBytes: number | null;
    messageCount: number;
    maxMessages: number;
  };
  leases: DwnStorageLease[];
}

export interface DwnRegistrationBlindTokenResult {
  success: boolean;
  grantedBytes?: number;
  totalStorageBytes?: number;
  activeLeases?: number;
}

export interface DidSignerLike {
  algorithm: string;
  keyId: string;
  sign(params: { data: Uint8Array }): Promise<Uint8Array>;
}

export interface DidPopAgentLike {
  agentDid?: {
    uri: string;
    getSigner?: () => Promise<DidSignerLike>;
  };
  identity?: {
    get?: (params: { didUri: string }) => Promise<{
      did?: { getSigner?: () => Promise<DidSignerLike> };
    } | undefined>;
  };
}

export class BlindTokenHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail: string;

  constructor(message: string, options: { status: number; code?: string; detail: string }) {
    super(message);
    this.name = 'BlindTokenHttpError';
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
  }
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function resolveMintUrl(issuerUrls?: readonly string[], preferred?: string): string {
  const candidate = preferred?.trim() || issuerUrls?.find((u) => u.trim().length > 0) || DEFAULT_MINT_URL;
  return normalizeBaseUrl(candidate);
}

const BASE64URL_REGEX = /^[A-Za-z0-9_-]*$/;

export function toBase64Url(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.byteLength));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(input: string): Uint8Array {
  if (typeof input !== 'string' || !BASE64URL_REGEX.test(input)) {
    throw new Error('Invalid base64url encoding');
  }
  if (input.length % 4 === 1) {
    throw new Error('Invalid base64url length');
  }

  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function formatKeyId(aud: string, unit: string, epoch: string): string {
  const kid = `${aud}:${unit}:${epoch}`;
  if (!KID_REGEX.test(kid)) {
    throw new Error(`Invalid key ID components: ${kid}`);
  }
  return kid;
}

export function parseKeyId(kid: string): ParsedKeyId | null {
  if (typeof kid !== 'string') {
    return null;
  }
  const match = KID_REGEX.exec(kid);
  if (!match) {
    return null;
  }
  return {
    kid,
    aud: match[1]!,
    unit: match[2]!,
    epoch: match[3]!,
  };
}

export function decomposeCredits(
  totalCredits: number,
  denominations: readonly MintDenomination[],
): MintDenomination[] {
  if (!Number.isInteger(totalCredits) || totalCredits < 0) {
    throw new Error(`Credit total must be a non-negative integer, received ${totalCredits}`);
  }
  if (totalCredits === 0) {
    return [];
  }

  const sorted = [...denominations]
    .filter((d) => Number.isInteger(d.credits) && d.credits > 0)
    .sort((a, b) => b.credits - a.credits);

  if (sorted.length === 0) {
    throw new Error('No positive mint denominations configured');
  }

  const result: MintDenomination[] = [];
  let remaining = totalCredits;

  for (const denom of sorted) {
    while (remaining >= denom.credits) {
      result.push(denom);
      remaining -= denom.credits;
    }
  }

  if (remaining !== 0) {
    throw new Error(`Cannot decompose ${totalCredits} credits cleanly with configured denominations`);
  }

  return result;
}

/**
 * Selects the fewest / tightest universal `mint` tokens covering `targetCredits`.
 * Prefers exact subsets (zero change) up to bounded DP threshold before falling back
 * to minimal overshoot.
 */
export function selectMintInputs<T extends BlindToken>(
  tokens: readonly T[],
  targetCredits: number,
  denominations: readonly MintDenomination[],
): T[] {
  if (!Number.isInteger(targetCredits) || targetCredits < 0) {
    throw new Error(`Target credits must be a non-negative integer, received ${targetCredits}`);
  }
  if (targetCredits === 0) {
    return [];
  }

  const creditsByUnit = new Map(denominations.map((d) => [d.unit, d.credits]));
  const priced = tokens
    .map((token) => {
      const parsed = parseKeyId(token.kid);
      const credits = parsed?.aud === 'mint' ? (creditsByUnit.get(parsed.unit) ?? 0) : 0;
      return { token, credits };
    })
    .filter((item) => Number.isInteger(item.credits) && item.credits > 0);

  const totalAvailable = priced.reduce((sum, item) => sum + item.credits, 0);
  if (totalAvailable < targetCredits) {
    throw new Error(`Insufficient credits: need ${targetCredits}, have ${totalAvailable}`);
  }

  // Exact single-token match first.
  const exactSingle = priced.find((item) => item.credits === targetCredits);
  if (exactSingle) {
    return [exactSingle.token];
  }

  // Sort descending so fewer large tokens are preferred for equal sums.
  const sortedDesc = [...priced].sort((a, b) => b.credits - a.credits);

  if (targetCredits <= 512) {
    // DP tracking the minimum token count to reach each exact sum <= targetCredits.
    const counts = new Array<number>(targetCredits + 1).fill(Infinity);
    const prevSum = new Array<number>(targetCredits + 1).fill(-1);
    const chosenIdx = new Array<number>(targetCredits + 1).fill(-1);
    counts[0] = 0;

    for (let i = 0; i < sortedDesc.length; i += 1) {
      const weight = sortedDesc[i]!.credits;
      if (weight > targetCredits) continue;
      for (let sum = targetCredits; sum >= weight; sum -= 1) {
        const candidateCount = counts[sum - weight]! + 1;
        if (candidateCount < counts[sum]!) {
          counts[sum] = candidateCount;
          prevSum[sum] = sum - weight;
          chosenIdx[sum] = i;
        }
      }
    }

    if (Number.isFinite(counts[targetCredits]!) && counts[targetCredits]! <= MAX_EXCHANGE_INPUTS) {
      const exact: T[] = [];
      let cur = targetCredits;
      while (cur > 0) {
        const idx = chosenIdx[cur]!;
        exact.push(sortedDesc[idx]!.token);
        cur = prevSum[cur]!;
      }
      return exact;
    }
  }

  // Fallback 1: smallest single token strictly greater than targetCredits (only 1 input + clean change).
  const singleLarger = [...priced]
    .filter((item) => item.credits > targetCredits)
    .sort((a, b) => a.credits - b.credits)[0];

  // Fallback 2: greedy descending cover (minimizes input token count when target exceeds any single note).
  const greedy: T[] = [];
  let accumulated = 0;
  for (const item of sortedDesc) {
    greedy.push(item.token);
    accumulated += item.credits;
    if (accumulated >= targetCredits) {
      break;
    }
  }

  const chosen = singleLarger && greedy.length > 1 ? [singleLarger.token] : greedy;
  if (chosen.length > MAX_EXCHANGE_INPUTS) {
    throw new Error(
      `Need ${chosen.length} small tokens to cover ${targetCredits} credits (max ${MAX_EXCHANGE_INPUTS}); refresh credits to consolidate denominations`,
    );
  }
  return chosen;
}

export async function importPublicIssuerKey(jwk: BlindIssuerJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg,
      ext: true,
    },
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
}

export async function createBlindedToken(
  publicKey: CryptoKey,
  kid: string,
): Promise<{ state: PreparedBlindState; request: BlindedRequestItem }> {
  if (!parseKeyId(kid)) {
    throw new Error(`Invalid key ID: ${kid}`);
  }
  const suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW: false });
  const raw = crypto.getRandomValues(new Uint8Array(RAW_TOKEN_BYTES));
  const preparedMsg = suite.prepare(raw);
  const { blindedMsg, inv } = await suite.blind(publicKey, preparedMsg);

  return {
    state: {
      kid,
      preparedMsg,
      blindedMsg,
      inv,
    },
    request: {
      kid,
      blindedMsg: toBase64Url(blindedMsg),
    },
  };
}

export async function finalizeBlindToken(
  publicKey: CryptoKey,
  state: PreparedBlindState,
  blindSigBase64Url: string,
): Promise<BlindToken> {
  const blindSig = fromBase64Url(blindSigBase64Url);
  if (blindSig.byteLength !== RSA_MODULUS_BYTES) {
    throw new Error(`blindSig must be ${RSA_MODULUS_BYTES} bytes, received ${blindSig.byteLength}`);
  }
  const suite = RSABSSA.SHA384.PSS.Randomized({ supportsRSARAW: false });
  const sig = await suite.finalize(publicKey, state.preparedMsg, blindSig, state.inv);
  return {
    kid: state.kid,
    msg: toBase64Url(state.preparedMsg),
    sig: toBase64Url(sig),
  };
}

async function readErrorPayload(res: Response): Promise<{ code?: string; detail: string }> {
  const text = typeof res.text === 'function' ? await res.text() : '';
  try {
    const parsed = JSON.parse(text) as { message?: string; detail?: string; code?: string };
    return {
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      detail: parsed.detail || parsed.message || parsed.code || text || `HTTP ${res.status}`,
    };
  } catch {
    return { detail: text || `HTTP ${res.status}` };
  }
}

export async function fetchMintConfig(
  mintUrl: string = DEFAULT_MINT_URL,
  fetchFn: typeof fetch = fetch,
): Promise<MintConfigDocument> {
  const res = await fetchFn(`${normalizeBaseUrl(mintUrl)}/.well-known/mint-config.json`);
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `Failed to fetch mint config (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }
  return (await res.json()) as MintConfigDocument;
}

export async function previewInvite(params: {
  mintUrl?: string;
  inviteCode: string;
  fetchFn?: typeof fetch;
}): Promise<InvitePreview> {
  const fetchFn = params.fetchFn ?? fetch;
  const mintUrl = resolveMintUrl(undefined, params.mintUrl);
  const res = await fetchFn(`${mintUrl}/v1/invites/info`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inviteCode: params.inviteCode.trim() }),
  });
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `Invite check failed (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }
  return (await res.json()) as InvitePreview;
}

interface PreparedSlot {
  state: PreparedBlindState;
  request: BlindedRequestItem;
  publicKey: CryptoKey;
}

function findActiveKey(
  config: MintConfigDocument,
  aud: string,
  unit: string,
  epoch: string,
): BlindIssuerJwk {
  const kid = formatKeyId(aud, unit, epoch);
  const jwk = config.keys.find((entry) => entry.kid === kid && entry.active);
  if (!jwk) {
    throw new Error(`Mint config does not contain an active signing key for ${kid}`);
  }
  return jwk;
}

async function prepareOutputs(
  specs: ReadonlyArray<{ aud: string; unit: string }>,
  config: MintConfigDocument,
): Promise<PreparedSlot[]> {
  const keyCache = new Map<string, CryptoKey>();
  const slots: PreparedSlot[] = [];

  for (const spec of specs) {
    const kid = formatKeyId(spec.aud, spec.unit, config.currentEpoch);
    let publicKey = keyCache.get(kid);
    if (!publicKey) {
      const jwk = findActiveKey(config, spec.aud, spec.unit, config.currentEpoch);
      publicKey = await importPublicIssuerKey(jwk);
      keyCache.set(kid, publicKey);
    }
    const { state, request } = await createBlindedToken(publicKey, kid);
    slots.push({ state, request, publicKey });
  }

  return slots;
}

async function finalizeSlots(
  slots: readonly PreparedSlot[],
  signatures: readonly BlindSignatureItem[],
): Promise<BlindToken[]> {
  if (signatures.length !== slots.length) {
    throw new Error(`Expected ${slots.length} blind signatures, received ${signatures.length}`);
  }

  const tokens: BlindToken[] = [];
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]!;
    const sigItem = signatures[i]!;
    if (sigItem.kid !== slot.state.kid) {
      throw new Error(`Signature kid mismatch at index ${i}: expected ${slot.state.kid}, got ${sigItem.kid}`);
    }
    tokens.push(await finalizeBlindToken(slot.publicKey, slot.state, sigItem.blindSig));
  }
  return tokens;
}

function resolveUnitCredits(config: MintConfigDocument, aud: string, unit: string): number {
  if (aud === 'mint') {
    const denom = config.mintDenominations.find((d) => d.unit === unit);
    if (!denom) {
      throw new Error(`Unknown mint denomination unit: ${unit}`);
    }
    return denom.credits;
  }
  const tariff = config.tariffs.find((t) => t.aud === aud && t.unit === unit);
  if (!tariff) {
    throw new Error(`Unknown service tariff: ${aud}:${unit}`);
  }
  return tariff.credits;
}

export async function claimInvite(params: {
  mintUrl?: string;
  inviteCode: string;
  credits?: number;
  config?: MintConfigDocument;
  fetchFn?: typeof fetch;
}): Promise<{ tokens: BlindToken[]; credits: number; config: MintConfigDocument }> {
  const fetchFn = params.fetchFn ?? fetch;
  const mintUrl = resolveMintUrl(undefined, params.mintUrl);
  const inviteCode = params.inviteCode.trim();
  const config = params.config ?? (await fetchMintConfig(mintUrl, fetchFn));

  let credits = params.credits;
  if (credits === undefined) {
    const preview = await previewInvite({ mintUrl, inviteCode, fetchFn });
    if (!preview.valid || preview.remainingUses <= 0) {
      throw new Error('Invite is invalid, exhausted, or expired');
    }
    credits = preview.credits;
  }

  const denominations = decomposeCredits(credits, config.mintDenominations);
  const slots = await prepareOutputs(
    denominations.map((denom) => ({ aud: 'mint', unit: denom.unit })),
    config,
  );

  const res = await fetchFn(`${mintUrl}/v1/invites/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inviteCode,
      outputs: slots.map((s) => s.request),
    }),
  });
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `Invite redemption failed (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }

  const body = (await res.json()) as { signatures: BlindSignatureItem[] };
  const tokens = await finalizeSlots(slots, body.signatures);
  return { tokens, credits, config };
}

export async function exchangeTokens(params: {
  mintUrl?: string;
  inputs: readonly BlindToken[];
  targetOutputs?: readonly ExchangeTargetRequest[];
  config?: MintConfigDocument;
  fetchFn?: typeof fetch;
}): Promise<{ tokens: BlindToken[]; change: BlindToken[]; config: MintConfigDocument }> {
  if (params.inputs.length === 0) {
    throw new Error('exchangeTokens requires at least one input token');
  }

  const fetchFn = params.fetchFn ?? fetch;
  const mintUrl = resolveMintUrl(undefined, params.mintUrl);
  const config = params.config ?? (await fetchMintConfig(mintUrl, fetchFn));

  let inputCredits = 0;
  for (const input of params.inputs) {
    const parsed = parseKeyId(input.kid);
    if (!parsed || parsed.aud !== 'mint') {
      throw new Error(`Exchange input must be a universal mint token, received ${input.kid}`);
    }
    inputCredits += resolveUnitCredits(config, 'mint', parsed.unit);
  }

  const targetSpecs: Array<{ aud: string; unit: string }> = [];
  const nonMintAudiences = new Set<string>();
  let targetCredits = 0;

  for (const target of params.targetOutputs ?? []) {
    const count = target.count ?? 1;
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error(`Target output count must be a positive integer, received ${count}`);
    }
    if (target.aud !== 'mint') {
      nonMintAudiences.add(target.aud);
    }
    const unitCredits = resolveUnitCredits(config, target.aud, target.unit);
    targetCredits += unitCredits * count;
    for (let i = 0; i < count; i += 1) {
      targetSpecs.push({ aud: target.aud, unit: target.unit });
    }
  }

  if (nonMintAudiences.size > 1) {
    throw new Error(
      'exchangeTokens allows at most one target service audience per swap to prevent cross-service correlation',
    );
  }

  const changeCredits = inputCredits - targetCredits;
  if (changeCredits < 0) {
    throw new Error(`Insufficient input credits (${inputCredits}) for requested outputs (${targetCredits})`);
  }

  const changeSpecs = decomposeCredits(changeCredits, config.mintDenominations).map((d) => ({
    aud: 'mint',
    unit: d.unit,
  }));

  const targetSlots = await prepareOutputs(targetSpecs, config);
  const changeSlots = await prepareOutputs(changeSpecs, config);
  const allSlots = [...targetSlots, ...changeSlots];

  if (allSlots.length === 0) {
    throw new Error('exchangeTokens requires at least one requested output or change output');
  }

  const res = await fetchFn(`${mintUrl}/v1/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      inputs: params.inputs,
      outputs: allSlots.map((s) => s.request),
    }),
  });
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `Token exchange failed (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }

  const body = (await res.json()) as { signatures: BlindSignatureItem[] };
  const allTokens = await finalizeSlots(allSlots, body.signatures);

  return {
    tokens: allTokens.slice(0, targetSlots.length),
    change: allTokens.slice(targetSlots.length),
    config,
  };
}

/**
 * Selects the highest-capacity storage lease unit supported by both the DWN endpoint
 * and an active key+tariff on the mint.
 */
export function chooseStorageUnit(
  config: MintConfigDocument,
  descriptor: ServerBlindTokenDescriptor,
): { tariff: TariffEntry; unitSpec: StorageLeaseUnitSpec } {
  const candidates = descriptor.units
    .map((unitSpec) => {
      const tariff = config.tariffs.find(
        (t) => t.aud === descriptor.audience && t.unit === unitSpec.unit,
      );
      if (!tariff) {
        return undefined;
      }
      const hasActiveKey = config.keys.some(
        (k) =>
          k.aud === descriptor.audience &&
          k.unit === unitSpec.unit &&
          k.epoch === config.currentEpoch &&
          k.active,
      );
      if (!hasActiveKey) {
        return undefined;
      }
      return { tariff, unitSpec };
    })
    .filter((entry): entry is { tariff: TariffEntry; unitSpec: StorageLeaseUnitSpec } => Boolean(entry))
    .sort((a, b) => b.unitSpec.bytes - a.unitSpec.bytes);

  const selected = candidates[0];
  if (!selected) {
    throw new Error(`No active storage tariff found for ${descriptor.audience}`);
  }
  return selected;
}

export interface EndpointBlindTokenInfo {
  endpoint: string;
  registrationRequirements: string[];
  blindToken?: ServerBlindTokenDescriptor;
}

const INFO_CACHE_TTL_MS = 60_000;
const endpointInfoCache = new Map<string, { fetchedAt: number; info: EndpointBlindTokenInfo }>();

export function clearEndpointBlindTokenCache(endpoint?: string): void {
  if (endpoint) {
    endpointInfoCache.delete(normalizeBaseUrl(endpoint));
  } else {
    endpointInfoCache.clear();
  }
}

/**
 * Reads `GET <endpoint>/info` directly so `blindToken` is preserved even when
 * `@enbox/dwn-clients`'s `ServerInfo` mapper omits extension fields.
 */
export async function fetchEndpointBlindTokenInfo(
  endpoint: string,
  options?: { fetchFn?: typeof fetch; forceRefresh?: boolean; nowMs?: number },
): Promise<EndpointBlindTokenInfo> {
  const normalized = normalizeBaseUrl(endpoint);
  const nowMs = options?.nowMs ?? Date.now();
  const useCache = !options?.fetchFn && !options?.forceRefresh;

  if (useCache) {
    const cached = endpointInfoCache.get(normalized);
    if (cached && nowMs - cached.fetchedAt < INFO_CACHE_TTL_MS) {
      return cached.info;
    }
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const res = await fetchFn(`${normalized}/info`);
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `Failed to fetch server info (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }

  const body = (await res.json()) as {
    registrationRequirements?: unknown;
    blindToken?: ServerBlindTokenDescriptor;
  };
  const info: EndpointBlindTokenInfo = {
    endpoint: normalized,
    registrationRequirements: Array.isArray(body.registrationRequirements)
      ? body.registrationRequirements.filter((item): item is string => typeof item === 'string')
      : [],
    blindToken: body.blindToken,
  };

  if (!options?.fetchFn) {
    endpointInfoCache.set(normalized, { fetchedAt: nowMs, info });
  }

  return info;
}

export async function postBlindTokenRegistration(params: {
  registrationUrl: string;
  did: string;
  blindTokens: readonly BlindToken[];
  fetchFn?: typeof fetch;
}): Promise<DwnRegistrationBlindTokenResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const res = await fetchFn(params.registrationUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      registrationData: { did: params.did },
      blindTokens: params.blindTokens,
    }),
  });
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `DWN blind-token registration failed (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }
  return (await res.json()) as DwnRegistrationBlindTokenResult;
}

async function resolveDidSigner(agent: DidPopAgentLike, didUri: string): Promise<DidSignerLike> {
  if (didUri === agent.agentDid?.uri && typeof agent.agentDid.getSigner === 'function') {
    return agent.agentDid.getSigner();
  }
  const identity = await agent.identity?.get?.({ didUri });
  if (typeof identity?.did?.getSigner === 'function') {
    return identity.did.getSigner();
  }
  throw new Error(`No signing key available for DID ${didUri}`);
}

export async function buildDidPopHeader(params: {
  didUri: string;
  audience: string;
  scope?: string;
  signer?: DidSignerLike;
  agent?: DidPopAgentLike;
  lifetimeSeconds?: number;
  nowMs?: number;
}): Promise<string> {
  const signer =
    params.signer ??
    (params.agent ? await resolveDidSigner(params.agent, params.didUri) : undefined);
  if (!signer) {
    throw new Error(`No signer or agent provided for DID ${params.didUri}`);
  }

  const rawKeyId = signer.keyId || '';
  const kid = rawKeyId.startsWith('#')
    ? `${params.didUri}${rawKeyId}`
    : rawKeyId.includes('#')
      ? rawKeyId
      : `${params.didUri}#${rawKeyId || '0'}`;

  const encoder = new TextEncoder();
  const headerB64 = toBase64Url(
    encoder.encode(
      JSON.stringify({
        alg: signer.algorithm || 'EdDSA',
        kid,
        typ: 'dwn-pop+jwt',
      }),
    ),
  );

  const iat = Math.floor((params.nowMs ?? Date.now()) / 1000);
  const ttl = Math.min(300, Math.max(1, params.lifetimeSeconds ?? 120));
  const payloadB64 = toBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: params.didUri,
        sub: params.didUri,
        aud: normalizeBaseUrl(params.audience),
        scope: params.scope ?? 'registration.quota',
        iat,
        exp: iat + ttl,
      }),
    ),
  );

  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await signer.sign({ data: encoder.encode(signingInput) });
  return `DID-PoP ${signingInput}.${toBase64Url(sig)}`;
}

export async function fetchEndpointQuota(params: {
  endpoint: string;
  didUri: string;
  quotaUrl?: string;
  signer?: DidSignerLike;
  agent?: DidPopAgentLike;
  fetchFn?: typeof fetch;
  nowMs?: number;
}): Promise<DwnQuotaResponse> {
  const fetchFn = params.fetchFn ?? fetch;
  const endpoint = normalizeBaseUrl(params.endpoint);
  const authHeader = await buildDidPopHeader({
    didUri: params.didUri,
    audience: endpoint,
    scope: 'registration.quota',
    signer: params.signer,
    agent: params.agent,
    nowMs: params.nowMs,
  });

  const url = params.quotaUrl || `${endpoint}/registration/quota`;
  const res = await fetchFn(url, {
    method: 'GET',
    headers: { authorization: authHeader },
  });
  if (!res.ok) {
    const err = await readErrorPayload(res);
    throw new BlindTokenHttpError(
      `Failed to fetch storage quota (${res.status}): ${err.detail}`,
      { status: res.status, code: err.code, detail: err.detail },
    );
  }
  return (await res.json()) as DwnQuotaResponse;
}
