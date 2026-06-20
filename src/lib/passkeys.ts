import {
  AUTH_METHOD_STORAGE_KEY,
  PASSKEY_CREDENTIAL_STORAGE_KEY,
} from '@/lib/constants';

export type WalletAuthMethod = 'pin' | 'passkey';

interface StoredPasskeyCredential {
  version: 1;
  credentialId: string;
  salt: string;
  iv: string;
  wrappedVaultPassword: string;
  createdAt: string;
}

export interface PreparedPasskeyVault {
  password: string;
  credential: StoredPasskeyCredential;
}

const PASSKEY_RP_NAME = 'Enbox Wallet';
const PASSKEY_USER_NAME = 'wallet@enbox.local';
const PASSKEY_USER_DISPLAY_NAME = 'Enbox Wallet';
const PASSKEY_TIMEOUT_MS = 60_000;
const AES_GCM_IV_BYTES = 12;
const VAULT_PASSWORD_BYTES = 32;
const WEBAUTHN_SALT_BYTES = 32;
const WEBAUTHN_CHALLENGE_BYTES = 32;

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
  return hasWebAuthnRuntime();
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
    throw new Error('Passkeys are not available on this device. Use a PIN instead.');
  }

  const password = randomBase64Url(VAULT_PASSWORD_BYTES);
  const salt = randomBytes(WEBAUTHN_SALT_BYTES);
  const credential = await createPasskeyCredential(salt);
  const prfOutput = await getPrfOutputFromCredential(credential, salt);
  const wrapped = await wrapVaultPassword(password, prfOutput);

  return {
    password,
    credential: {
      version: 1,
      credentialId: bytesToBase64Url(new Uint8Array(credential.rawId)),
      salt: bytesToBase64Url(salt),
      iv: bytesToBase64Url(wrapped.iv),
      wrappedVaultPassword: bytesToBase64Url(wrapped.ciphertext),
      createdAt: new Date().toISOString(),
    },
  };
}

export async function unlockWithStoredPasskey(): Promise<string> {
  const stored = getStoredPasskeyCredential();
  if (!stored) {
    throw new Error('No passkey is set up for this wallet.');
  }
  if (!(await isPasskeySupported())) {
    throw new Error('Passkeys are not available on this device.');
  }

  const prfOutput = await getPrfOutputForStoredCredential(stored);
  return decryptVaultPassword(stored, prfOutput);
}

function getStoredPasskeyCredential(): StoredPasskeyCredential | null {
  try {
    const raw = localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPasskeyCredential>;
    if (
      parsed.version !== 1 ||
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.salt !== 'string' ||
      typeof parsed.iv !== 'string' ||
      typeof parsed.wrappedVaultPassword !== 'string' ||
      typeof parsed.createdAt !== 'string'
    ) {
      return null;
    }
    return parsed as StoredPasskeyCredential;
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

async function getPrfOutputFromCredential(
  credential: PublicKeyCredential,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const output = getPrfOutput(credential);
  if (output) return output;

  const extensionResults = credential.getClientExtensionResults();
  if (extensionResults.prf?.enabled === false) {
    throw new Error('This passkey cannot secure the wallet vault. Use a PIN instead.');
  }

  return getPrfOutputForCredentialId(credential.rawId, salt);
}

async function getPrfOutputForStoredCredential(
  credential: StoredPasskeyCredential,
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
    throw new Error('This passkey cannot unlock the wallet vault. Use your recovery phrase to restore access.');
  }
  return output;
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
  credential: StoredPasskeyCredential,
  prfOutput: Uint8Array,
): Promise<string> {
  const key = await aesKeyFromPrfOutput(prfOutput, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(credential.iv)) },
    key,
    toArrayBuffer(base64UrlToBytes(credential.wrappedVaultPassword)),
  );
  return new TextDecoder().decode(plaintext);
}

async function aesKeyFromPrfOutput(
  output: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(output));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages);
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
