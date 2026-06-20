import {
  AUTH_METHOD_STORAGE_KEY,
  PASSKEY_CREDENTIAL_STORAGE_KEY,
} from '@/lib/constants';

export type WalletAuthMethod = 'pin' | 'passkey';

interface StoredPasskeyCredentialBase {
  version: 1 | 2;
  credentialId: string;
  iv: string;
  wrappedVaultPassword: string;
  createdAt: string;
}

interface StoredPrfPasskeyCredential extends StoredPasskeyCredentialBase {
  wrapping: 'prf';
  salt: string;
}

interface StoredLocalPasskeyCredential extends StoredPasskeyCredentialBase {
  version: 2;
  wrapping: 'local';
  keyId: string;
  publicKey: string;
  publicKeyAlgorithm: COSEAlgorithmIdentifier;
}

type StoredPasskeyCredential = StoredPrfPasskeyCredential | StoredLocalPasskeyCredential;

export interface PreparedPasskeyVault {
  password: string;
  credential: StoredPasskeyCredential;
}

export class PasskeyVaultUnsupportedError extends Error {
  constructor(message = 'This browser or passkey provider cannot secure the wallet vault. Create a PIN instead.') {
    super(message);
    this.name = 'PasskeyVaultUnsupportedError';
  }
}

const PASSKEY_RP_NAME = 'Enbox Wallet';
const PASSKEY_USER_NAME = 'wallet@enbox.local';
const PASSKEY_USER_DISPLAY_NAME = 'Enbox Wallet';
const PASSKEY_TIMEOUT_MS = 60_000;
const AES_GCM_IV_BYTES = 12;
const VAULT_PASSWORD_BYTES = 32;
const WEBAUTHN_SALT_BYTES = 32;
const WEBAUTHN_CHALLENGE_BYTES = 32;
const LOCAL_WRAPPING_KEY_BYTES = 16;
const LOCAL_WRAPPING_DB_NAME = 'enbox:passkeyVault';
const LOCAL_WRAPPING_DB_VERSION = 1;
const LOCAL_WRAPPING_STORE = 'keys';
const ES256_ALGORITHM = -7;
const RS256_ALGORITHM = -257;
const AUTHENTICATOR_DATA_FLAGS_OFFSET = 32;
const AUTHENTICATOR_FLAG_USER_PRESENT = 0x01;
const AUTHENTICATOR_FLAG_USER_VERIFIED = 0x04;

/**
 * Returns true when platform passkeys can be created. The stronger PRF vault
 * wrapping path is used when the selected passkey provider supports it;
 * otherwise the wallet falls back to a passkey-gated local wrapper.
 */
export async function isPasskeySupported(): Promise<boolean> {
  if (!canCheckPasskeySupport()) return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function canCheckPasskeySupport(): boolean {
  if (globalThis.isSecureContext === false) return false;
  return hasWebAuthnRuntime() && typeof indexedDB !== 'undefined';
}

export async function isPasskeyUnlockAvailable(): Promise<boolean> {
  if (!hasWebAuthnRuntime()) return false;
  if (globalThis.isSecureContext === false) return false;

  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isPasskeyVaultUnsupportedError(error: unknown): boolean {
  return error instanceof PasskeyVaultUnsupportedError;
}

export function getStoredAuthMethod(): WalletAuthMethod | null {
  try {
    const value = localStorage.getItem(AUTH_METHOD_STORAGE_KEY);
    return value === 'pin' || value === 'passkey' ? value : null;
  } catch {
    return null;
  }
}

export function hasStoredPasskeyCredential(): boolean {
  return getStoredPasskeyCredential() !== null;
}

export function storePasskeyCredential(credential: StoredPasskeyCredential): void {
  localStorage.setItem(PASSKEY_CREDENTIAL_STORAGE_KEY, JSON.stringify(credential));
  localStorage.setItem(AUTH_METHOD_STORAGE_KEY, 'passkey');
}

export function clearPasskeyCredential(): void {
  try {
    localStorage.removeItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
    if (localStorage.getItem(AUTH_METHOD_STORAGE_KEY) === 'passkey') {
      localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
    }
  } catch {
    /* noop */
  }
}

export function markPinAuthMethod(): void {
  try {
    localStorage.removeItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
    localStorage.setItem(AUTH_METHOD_STORAGE_KEY, 'pin');
  } catch {
    /* noop */
  }
}

export async function preparePasskeyVaultPassword(): Promise<PreparedPasskeyVault> {
  if (!(await isPasskeySupported())) {
    throw new Error('Passkeys are not available on this device. Create a PIN instead.');
  }

  const password = randomBase64Url(VAULT_PASSWORD_BYTES);
  const salt = randomBytes(WEBAUTHN_SALT_BYTES);
  const credential = await createPasskeyCredential(salt);
  const prfOutput = await tryGetPrfOutputFromCredential(credential, salt);

  if (prfOutput) {
    const wrapped = await wrapVaultPassword(password, prfOutput);

    return {
      password,
      credential: {
        version: 2,
        wrapping: 'prf',
        credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
        salt: bytesToBase64Url(salt),
        iv: bytesToBase64Url(wrapped.iv),
        wrappedVaultPassword: bytesToBase64Url(wrapped.ciphertext),
        createdAt: new Date().toISOString(),
      },
    };
  }

  return prepareLocalWrappedPasskeyVault(password, credential);
}

export async function unlockWithStoredPasskey(): Promise<string> {
  const stored = getStoredPasskeyCredential();
  if (!stored) {
    throw new Error('No passkey is set up for this wallet.');
  }
  if (!(await isPasskeyUnlockAvailable())) {
    throw new Error('Passkeys are not available on this device.');
  }

  if (stored.wrapping === 'local') {
    await verifyStoredPasskeyAssertion(stored);
    const key = await getLocalWrappingKey(stored.keyId);
    if (!key) {
      throw new Error('Passkey vault storage is missing. Restore from your recovery phrase to regain access.');
    }
    return decryptVaultPasswordWithKey(stored, key);
  }

  const prfOutput = await getPrfOutputForStoredCredential(stored);
  return decryptVaultPassword(stored, prfOutput);
}

function getStoredPasskeyCredential(): StoredPasskeyCredential | null {
  try {
    const raw = localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPasskeyCredentialBase> & Record<string, unknown>;
    const wrapping = parsed.wrapping ?? 'prf';
    if (
      (parsed.version !== 1 && parsed.version !== 2) ||
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.wrappedVaultPassword !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }
    if (wrapping === 'prf') {
      if (typeof parsed.salt !== 'string') return null;
      return {
        ...parsed,
        wrapping: 'prf',
      } as StoredPrfPasskeyCredential;
    }
    if (wrapping === 'local') {
      if (
        parsed.version !== 2 ||
        typeof parsed.keyId !== 'string' ||
        typeof parsed.publicKey !== 'string' ||
        typeof parsed.publicKeyAlgorithm !== 'number'
      ) {
        return null;
      }
      return {
        version: 2,
        wrapping: 'local',
        credentialId: parsed.credentialId,
        publicKey: parsed.publicKey,
        publicKeyAlgorithm: parsed.publicKeyAlgorithm,
        keyId: parsed.keyId,
        iv: parsed.iv,
        wrappedVaultPassword: parsed.wrappedVaultPassword,
        createdAt: parsed.createdAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function hasWebAuthnRuntime(): boolean {
  return (
    typeof PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof crypto.getRandomValues === 'function'
  );
}

async function createPasskeyCredential(salt: Uint8Array): Promise<PublicKeyCredential> {
  const existing = getStoredPasskeyCredential();
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: toArrayBuffer(randomBytes(WEBAUTHN_CHALLENGE_BYTES)),
    rp: { name: PASSKEY_RP_NAME },
    user: {
      id: toArrayBuffer(randomBytes(32)),
      name: PASSKEY_USER_NAME,
      displayName: PASSKEY_USER_DISPLAY_NAME,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: PASSKEY_TIMEOUT_MS,
    attestation: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'required',
    },
    extensions: {
      prf: {
        eval: {
          first: toArrayBuffer(salt),
        },
      },
    },
    excludeCredentials: existing
      ? [{ type: 'public-key', id: toArrayBuffer(base64UrlToBytes(existing.credentialId)) }]
      : undefined,
  };

  const credential = await navigator.credentials.create({ publicKey });
  return asPublicKeyCredential(credential);
}

async function tryGetPrfOutputFromCredential(
  credential: PublicKeyCredential,
  salt: Uint8Array,
): Promise<Uint8Array | null> {
  const output = getPrfOutput(credential);
  if (output) return output;

  const extensionResults = credential.getClientExtensionResults();
  if (extensionResults.prf?.enabled !== true) {
    return null;
  }

  try {
    return await getPrfOutputForCredentialId(credential.rawId, salt);
  } catch {
    return null;
  }
}

async function getPrfOutputForStoredCredential(
  credential: StoredPrfPasskeyCredential,
): Promise<Uint8Array> {
  return getPrfOutputForCredentialId(
    toArrayBuffer(base64UrlToBytes(credential.credentialId)),
    base64UrlToBytes(credential.salt),
  );
}

async function getPrfOutputForCredentialId(
  credentialId: ArrayBuffer,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: toArrayBuffer(randomBytes(WEBAUTHN_CHALLENGE_BYTES)),
    allowCredentials: [
      {
        type: 'public-key',
        id: credentialId,
      },
    ],
    userVerification: 'required',
    timeout: PASSKEY_TIMEOUT_MS,
    extensions: {
      prf: {
        eval: {
          first: toArrayBuffer(salt),
        },
      },
    },
  };

  const credential = await navigator.credentials.get({ publicKey });
  const output = getPrfOutput(asPublicKeyCredential(credential));
  if (!output) {
    throw new PasskeyVaultUnsupportedError(
      'This passkey cannot unlock the wallet vault. Use your recovery phrase to restore access.',
    );
  }
  return output;
}

async function prepareLocalWrappedPasskeyVault(
  password: string,
  credential: PublicKeyCredential,
): Promise<PreparedPasskeyVault> {
  const response = asAttestationResponse(credential.response);
  const publicKey = response.getPublicKey();
  if (!publicKey) {
    throw new PasskeyVaultUnsupportedError(
      'This passkey provider did not return enough information to secure the wallet vault. Create a PIN instead.',
    );
  }

  const keyId = randomBase64Url(LOCAL_WRAPPING_KEY_BYTES);
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  await storeLocalWrappingKey(keyId, key);
  const wrapped = await wrapVaultPasswordWithKey(password, key);

  return {
    password,
    credential: {
      version: 2,
      wrapping: 'local',
      credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
      publicKey: bytesToBase64Url(new Uint8Array(publicKey)),
      publicKeyAlgorithm: response.getPublicKeyAlgorithm(),
      keyId,
      iv: bytesToBase64Url(wrapped.iv),
      wrappedVaultPassword: bytesToBase64Url(wrapped.ciphertext),
      createdAt: new Date().toISOString(),
    },
  };
}

async function verifyStoredPasskeyAssertion(
  stored: StoredLocalPasskeyCredential,
): Promise<void> {
  const challenge = randomBytes(WEBAUTHN_CHALLENGE_BYTES);
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: toArrayBuffer(challenge),
    allowCredentials: [
      {
        type: 'public-key',
        id: toArrayBuffer(base64UrlToBytes(stored.credentialId)),
      },
    ],
    userVerification: 'required',
    timeout: PASSKEY_TIMEOUT_MS,
  };

  const credential = asPublicKeyCredential(await navigator.credentials.get({ publicKey }));
  const response = asAssertionResponse(credential.response);
  const clientData = parseClientData(response.clientDataJSON);
  if (clientData.type !== 'webauthn.get' || clientData.challenge !== bytesToBase64Url(challenge)) {
    throw new Error('Passkey verification failed.');
  }

  const authenticatorData = bufferSourceToBytes(response.authenticatorData);
  const flags = authenticatorData[AUTHENTICATOR_DATA_FLAGS_OFFSET] ?? 0;
  if (
    (flags & AUTHENTICATOR_FLAG_USER_PRESENT) === 0 ||
    (flags & AUTHENTICATOR_FLAG_USER_VERIFIED) === 0
  ) {
    throw new Error('Passkey verification requires user verification.');
  }

  const clientDataHash = await crypto.subtle.digest('SHA-256', response.clientDataJSON);
  const signedData = concatBytes(authenticatorData, new Uint8Array(clientDataHash));
  const publicKeyCryptoKey = await importPasskeyPublicKey(stored);
  const verified = await verifyPasskeySignature(
    publicKeyCryptoKey,
    stored.publicKeyAlgorithm,
    response.signature,
    signedData,
  );
  if (!verified) {
    throw new Error('Passkey verification failed.');
  }
}

function asPublicKeyCredential(credential: Credential | null): PublicKeyCredential {
  if (
    credential?.type !== 'public-key' ||
    typeof (credential as PublicKeyCredential).getClientExtensionResults !== 'function'
  ) {
    throw new Error('Passkey verification was cancelled.');
  }
  return credential as PublicKeyCredential;
}

function asAttestationResponse(response: AuthenticatorResponse): AuthenticatorAttestationResponse {
  if (
    typeof (response as AuthenticatorAttestationResponse).getPublicKey !== 'function' ||
    typeof (response as AuthenticatorAttestationResponse).getPublicKeyAlgorithm !== 'function'
  ) {
    throw new PasskeyVaultUnsupportedError(
      'This passkey provider did not return enough information to secure the wallet vault. Create a PIN instead.',
    );
  }
  return response as AuthenticatorAttestationResponse;
}

function asAssertionResponse(response: AuthenticatorResponse): AuthenticatorAssertionResponse {
  const assertion = response as AuthenticatorAssertionResponse;
  if (!assertion.authenticatorData || !assertion.signature) {
    throw new Error('Passkey verification failed.');
  }
  return assertion;
}

function getPrfOutput(credential: PublicKeyCredential): Uint8Array | null {
  const output = credential.getClientExtensionResults().prf?.results?.first;
  return output ? bufferSourceToBytes(output) : null;
}

async function wrapVaultPassword(
  password: string,
  prfOutput: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const key = await aesKeyFromPrfOutput(prfOutput, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(new TextEncoder().encode(password)),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decryptVaultPassword(
  credential: StoredPrfPasskeyCredential,
  prfOutput: Uint8Array,
): Promise<string> {
  const key = await aesKeyFromPrfOutput(prfOutput, ['decrypt']);
  return decryptVaultPasswordWithKey(credential, key);
}

async function wrapVaultPasswordWithKey(
  password: string,
  key: CryptoKey,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(new TextEncoder().encode(password)),
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decryptVaultPasswordWithKey(
  credential: StoredPasskeyCredential,
  key: CryptoKey,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(credential.iv)) },
    key,
    toArrayBuffer(base64UrlToBytes(credential.wrappedVaultPassword)),
  );
  return new TextDecoder().decode(plaintext);
}

async function importPasskeyPublicKey(
  credential: StoredLocalPasskeyCredential,
): Promise<CryptoKey> {
  const publicKey = toArrayBuffer(base64UrlToBytes(credential.publicKey));
  if (credential.publicKeyAlgorithm === ES256_ALGORITHM) {
    return crypto.subtle.importKey(
      'spki',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  }
  if (credential.publicKeyAlgorithm === RS256_ALGORITHM) {
    return crypto.subtle.importKey(
      'spki',
      publicKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  }
  throw new Error('Unsupported passkey algorithm.');
}

async function verifyPasskeySignature(
  key: CryptoKey,
  algorithm: COSEAlgorithmIdentifier,
  signature: ArrayBuffer,
  signedData: Uint8Array,
): Promise<boolean> {
  if (algorithm === ES256_ALGORITHM) {
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      toArrayBuffer(derEcdsaSignatureToRaw(new Uint8Array(signature), 32)),
      toArrayBuffer(signedData),
    );
  }
  if (algorithm === RS256_ALGORITHM) {
    return crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature,
      toArrayBuffer(signedData),
    );
  }
  return false;
}

async function aesKeyFromPrfOutput(
  output: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(output));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages);
}

async function storeLocalWrappingKey(keyId: string, key: CryptoKey): Promise<void> {
  const db = await openLocalWrappingDb();
  await idbRequest<IDBValidKey>(
    db.transaction(LOCAL_WRAPPING_STORE, 'readwrite')
      .objectStore(LOCAL_WRAPPING_STORE)
      .put(key, keyId),
  );
  db.close();
}

async function getLocalWrappingKey(keyId: string): Promise<CryptoKey | null> {
  const db = await openLocalWrappingDb();
  const key = await idbRequest<CryptoKey | undefined>(
    db.transaction(LOCAL_WRAPPING_STORE, 'readonly')
      .objectStore(LOCAL_WRAPPING_STORE)
      .get(keyId),
  );
  db.close();
  return key ?? null;
}

function openLocalWrappingDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_WRAPPING_DB_NAME, LOCAL_WRAPPING_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_WRAPPING_STORE)) {
        db.createObjectStore(LOCAL_WRAPPING_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open passkey vault storage.'));
    request.onblocked = () => reject(new Error('Passkey vault storage is blocked by another tab.'));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Passkey vault storage failed.'));
  });
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function randomBase64Url(length: number): string {
  return bytesToBase64Url(randomBytes(length));
}

function bufferSourceToBytes(source: BufferSource): Uint8Array<ArrayBuffer> {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  return new Uint8Array(toArrayBuffer(new Uint8Array(source.buffer, source.byteOffset, source.byteLength)));
}

function parseClientData(clientDataJSON: ArrayBuffer): { type?: string; challenge?: string } {
  try {
    return JSON.parse(new TextDecoder().decode(clientDataJSON)) as { type?: string; challenge?: string };
  } catch {
    throw new Error('Passkey verification failed.');
  }
}

function concatBytes(first: Uint8Array, second: Uint8Array): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(first.length + second.length);
  result.set(first, 0);
  result.set(second, first.length);
  return result;
}

function derEcdsaSignatureToRaw(signature: Uint8Array, partLength: number): Uint8Array<ArrayBuffer> {
  if (signature.length === partLength * 2) {
    return new Uint8Array(signature);
  }
  if (signature[0] !== 0x30) {
    throw new Error('Passkey verification failed.');
  }

  let offset = 2;
  if (signature[1] === 0x81) offset = 3;
  if (signature[offset] !== 0x02) {
    throw new Error('Passkey verification failed.');
  }
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;

  if (signature[offset] !== 0x02) {
    throw new Error('Passkey verification failed.');
  }
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);

  const raw = new Uint8Array(partLength * 2);
  raw.set(trimAndPadInteger(r, partLength), 0);
  raw.set(trimAndPadInteger(s, partLength), partLength);
  return raw;
}

function trimAndPadInteger(value: Uint8Array, length: number): Uint8Array<ArrayBuffer> {
  let trimmed = value;
  while (trimmed.length > length && trimmed[0] === 0) {
    trimmed = trimmed.slice(1);
  }
  if (trimmed.length > length) {
    throw new Error('Passkey verification failed.');
  }
  const padded = new Uint8Array(length);
  padded.set(trimmed, length - trimmed.length);
  return padded;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}
