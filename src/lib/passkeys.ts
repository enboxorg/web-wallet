import { Effect } from 'effect';

import { runEnboxPromise, runEnboxSync } from '@/enbox/effect/runtime';
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
const PASSKEY_CAPABILITY_TIMEOUT_MS = 1_000;
const PASSKEY_TIMEOUT_MS = 60_000;
const PASSKEY_STORAGE_TIMEOUT_MS = 10_000;
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

function passkeyError(operation: string) {
  return (cause: unknown) => {
    if (cause instanceof Error) return cause;
    return new Error(`${operation} failed`);
  };
}

/**
 * Synchronously checks whether this page can start passkey vault creation.
 * The platform-authenticator capability probe is deliberately not used as a
 * gate: some browsers leave it pending even though credentials.create works.
 */
export function canCreatePasskeyVault(): boolean {
  return runEnboxSync(canCreatePasskeyVaultEffect());
}

export function canCreatePasskeyVaultEffect() {
  return Effect.sync(() => {
    if (globalThis.isSecureContext === false) return false;
    return hasPasskeyCreationRuntime() && typeof indexedDB !== 'undefined';
  });
}

/**
 * Synchronously checks whether this page can start a stored passkey request.
 * Do not put the platform-authenticator capability probe in the unlock path:
 * some browsers leave that probe pending even though credentials.get works.
 */
export function canUsePasskeyUnlock(): boolean {
  return (
    globalThis.isSecureContext !== false &&
    hasPasskeyRequestRuntime()
  );
}

export function isPasskeyVaultUnsupportedError(error: unknown): boolean {
  return error instanceof PasskeyVaultUnsupportedError;
}

export function getStoredAuthMethod(): WalletAuthMethod | null {
  return runEnboxSync(getStoredAuthMethodEffect());
}

export function getStoredAuthMethodEffect() {
  return Effect.sync(() => {
    try {
      const value = localStorage.getItem(AUTH_METHOD_STORAGE_KEY);
      return value === 'pin' || value === 'passkey' ? value : null;
    } catch {
      return null;
    }
  });
}

export function hasStoredPasskeyCredential(): boolean {
  return runEnboxSync(hasStoredPasskeyCredentialEffect());
}

export function hasStoredPasskeyCredentialEffect() {
  return getStoredPasskeyCredentialEffect().pipe(
    Effect.map((credential) => credential !== null),
  );
}

export function storePasskeyCredential(credential: StoredPasskeyCredential): void {
  runEnboxSync(storePasskeyCredentialEffect(credential));
}

export function storePasskeyCredentialEffect(credential: StoredPasskeyCredential) {
  return Effect.try({
    try: () => {
      localStorage.setItem(PASSKEY_CREDENTIAL_STORAGE_KEY, JSON.stringify(credential));
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, 'passkey');
    },
    catch: passkeyError('passkey.storeCredential'),
  });
}

export function clearPasskeyCredential(): void {
  runEnboxSync(clearPasskeyCredentialEffect());
}

export function clearPasskeyCredentialEffect() {
  return Effect.sync(() => {
    try {
      localStorage.removeItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
      if (localStorage.getItem(AUTH_METHOD_STORAGE_KEY) === 'passkey') {
        localStorage.removeItem(AUTH_METHOD_STORAGE_KEY);
      }
    } catch {
      /* noop */
    }
  });
}

export function markPinAuthMethod(): void {
  runEnboxSync(markPinAuthMethodEffect());
}

export function markPinAuthMethodEffect() {
  return Effect.sync(() => {
    try {
      localStorage.removeItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
      localStorage.setItem(AUTH_METHOD_STORAGE_KEY, 'pin');
    } catch {
      /* noop */
    }
  });
}

export async function preparePasskeyVaultPassword(signal?: AbortSignal): Promise<PreparedPasskeyVault> {
  return runEnboxPromise(preparePasskeyVaultPasswordEffect(signal));
}

export function preparePasskeyVaultPasswordEffect(signal?: AbortSignal) {
  return Effect.gen(function* () {
    if (!(yield* canCreatePasskeyVaultEffect())) {
      return yield* Effect.fail(
        new PasskeyVaultUnsupportedError(),
      );
    }
    const platformAuthenticatorAvailable = yield* checkPlatformAuthenticatorAvailabilityEffect();
    if (platformAuthenticatorAvailable === false) {
      return yield* Effect.fail(new PasskeyVaultUnsupportedError());
    }

    const password = yield* randomBase64UrlEffect(VAULT_PASSWORD_BYTES);
    const salt = yield* randomBytesEffect(WEBAUTHN_SALT_BYTES);
    const credential = yield* createPasskeyCredentialEffect(salt, signal);
    const prfOutput = yield* tryGetPrfOutputFromCredentialEffect(credential, salt, signal);

    if (prfOutput) {
      const wrapped = yield* wrapVaultPasswordEffect(password, prfOutput);

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
      } satisfies PreparedPasskeyVault;
    }

    return yield* prepareLocalWrappedPasskeyVaultEffect(password, credential);
  });
}

export async function unlockWithStoredPasskey(signal?: AbortSignal): Promise<string> {
  return runEnboxPromise(unlockWithStoredPasskeyEffect(signal));
}

export function unlockWithStoredPasskeyEffect(signal?: AbortSignal) {
  return Effect.gen(function* () {
    const stored = yield* getStoredPasskeyCredentialEffect();
    if (!stored) {
      return yield* Effect.fail(new Error('No passkey is set up for this wallet.'));
    }
    if (!canUsePasskeyUnlock()) {
      return yield* Effect.fail(new Error('Passkeys are not available on this device.'));
    }
    if (stored.wrapping === 'local' && typeof indexedDB === 'undefined') {
      return yield* Effect.fail(
        new Error('Passkey vault storage is unavailable. Restore from your recovery phrase to regain access.'),
      );
    }

    if (stored.wrapping === 'local') {
      yield* verifyStoredPasskeyAssertionEffect(stored, signal);
      const key = yield* getLocalWrappingKeyEffect(stored.keyId);
      if (!key) {
        return yield* Effect.fail(
          new Error('Passkey vault storage is missing. Restore from your recovery phrase to regain access.'),
        );
      }
      return yield* decryptVaultPasswordWithKeyEffect(stored, key);
    }

    const prfOutput = yield* getPrfOutputForStoredCredentialEffect(stored, signal);
    return yield* decryptVaultPasswordEffect(stored, prfOutput);
  });
}

function getStoredPasskeyCredentialEffect() {
  return Effect.sync((): StoredPasskeyCredential | null => {
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
  });
}

function hasPasskeyRequestRuntime(): boolean {
  return (
    typeof PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.credentials &&
    typeof navigator.credentials.get === 'function' &&
    typeof AbortController !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle &&
    typeof crypto.getRandomValues === 'function'
  );
}

function hasPasskeyCreationRuntime(): boolean {
  return (
    hasPasskeyRequestRuntime() &&
    typeof navigator.credentials.create === 'function'
  );
}

/**
 * Uses the browser's capability hint when it settles promptly, but never lets
 * that advisory check stand between a user gesture and the real ceremony.
 * `undefined` means "unknown — try WebAuthn directly".
 */
function checkPlatformAuthenticatorAvailabilityEffect() {
  return Effect.tryPromise({
    try: checkPlatformAuthenticatorAvailability,
    catch: passkeyError('passkey.supportCheck'),
  }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
}

async function checkPlatformAuthenticatorAvailability(): Promise<boolean | undefined> {
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return undefined;
  }

  let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
      new Promise<undefined>((resolve) => {
        timeout = globalThis.setTimeout(() => resolve(undefined), PASSKEY_CAPABILITY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout);
  }
}

function createPasskeyCredentialEffect(salt: Uint8Array, signal?: AbortSignal) {
  return Effect.gen(function* () {
    const existing = yield* getStoredPasskeyCredentialEffect();
    const challenge = yield* randomBytesEffect(WEBAUTHN_CHALLENGE_BYTES);
    const userId = yield* randomBytesEffect(32);
    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge: toArrayBuffer(challenge),
      rp: { name: PASSKEY_RP_NAME },
      user: {
        id: toArrayBuffer(userId),
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

    return yield* requestPasskeyCredentialEffect(
      (requestSignal) => navigator.credentials.create({ publicKey, signal: requestSignal }),
      signal,
      'passkey.createCredential',
    ).pipe(
      Effect.catchAll((error) =>
        error.name === 'NotSupportedError'
          ? Effect.fail(new PasskeyVaultUnsupportedError())
          : Effect.fail(error)
      ),
    );
  });
}

function tryGetPrfOutputFromCredentialEffect(
  credential: PublicKeyCredential,
  salt: Uint8Array,
  signal?: AbortSignal,
): Effect.Effect<Uint8Array | null, never, never> {
  const output = getPrfOutput(credential);
  if (output) return Effect.succeed(output);

  const extensionResults = credential.getClientExtensionResults();
  if (extensionResults.prf?.enabled !== true) {
    return Effect.succeed(null);
  }

  return getPrfOutputForCredentialIdEffect(credential.rawId, salt, signal).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  );
}

function getPrfOutputForStoredCredentialEffect(
  credential: StoredPrfPasskeyCredential,
  signal?: AbortSignal,
): Effect.Effect<Uint8Array, Error, never> {
  return getPrfOutputForCredentialIdEffect(
    toArrayBuffer(base64UrlToBytes(credential.credentialId)),
    base64UrlToBytes(credential.salt),
    signal,
  );
}

function getPrfOutputForCredentialIdEffect(
  credentialId: ArrayBuffer,
  salt: Uint8Array,
  signal?: AbortSignal,
) {
  return Effect.gen(function* () {
    const challenge = yield* randomBytesEffect(WEBAUTHN_CHALLENGE_BYTES);
    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: toArrayBuffer(challenge),
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

    const credential = yield* requestPasskeyCredentialEffect(
      (requestSignal) => navigator.credentials.get({ publicKey, signal: requestSignal }),
      signal,
      'passkey.getPrfOutput',
    );
    const output = getPrfOutput(credential);
    if (!output) {
      return yield* Effect.fail(
        new PasskeyVaultUnsupportedError(
          'This passkey cannot unlock the wallet vault. Use your recovery phrase to restore access.',
        ),
      );
    }
    return output;
  });
}

function prepareLocalWrappedPasskeyVaultEffect(
  password: string,
  credential: PublicKeyCredential,
): Effect.Effect<PreparedPasskeyVault, Error, never> {
  const response = asAttestationResponse(credential.response);
  const publicKey = response.getPublicKey();
  if (!publicKey) {
    return Effect.fail(
      new PasskeyVaultUnsupportedError(
        'This passkey provider did not return enough information to secure the wallet vault. Create a PIN instead.',
      ),
    );
  }

  return Effect.gen(function* () {
    const keyId = yield* randomBase64UrlEffect(LOCAL_WRAPPING_KEY_BYTES);
    const key = yield* Effect.tryPromise({
      try: async () =>
        crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt'],
        ),
      catch: passkeyError('passkey.generateLocalWrappingKey'),
    });
    yield* storeLocalWrappingKeyEffect(keyId, key);
    const wrapped = yield* wrapVaultPasswordWithKeyEffect(password, key);

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
  });
}

function verifyStoredPasskeyAssertionEffect(
  stored: StoredLocalPasskeyCredential,
  signal?: AbortSignal,
): Effect.Effect<void, Error, never> {
  return Effect.gen(function* () {
    const challenge = yield* randomBytesEffect(WEBAUTHN_CHALLENGE_BYTES);
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

    const credential = yield* requestPasskeyCredentialEffect(
      (requestSignal) => navigator.credentials.get({ publicKey, signal: requestSignal }),
      signal,
      'passkey.verifyAssertion',
    );
    const response = asAssertionResponse(credential.response);
    const clientData = parseClientData(response.clientDataJSON);
    if (clientData.type !== 'webauthn.get' || clientData.challenge !== bytesToBase64Url(challenge)) {
      return yield* Effect.fail(new Error('Passkey verification failed.'));
    }

    const authenticatorData = bufferSourceToBytes(response.authenticatorData);
    const flags = authenticatorData[AUTHENTICATOR_DATA_FLAGS_OFFSET] ?? 0;
    if (
      (flags & AUTHENTICATOR_FLAG_USER_PRESENT) === 0 ||
      (flags & AUTHENTICATOR_FLAG_USER_VERIFIED) === 0
    ) {
      return yield* Effect.fail(new Error('Passkey verification requires user verification.'));
    }

    const clientDataHash = yield* Effect.tryPromise({
      try: async () => crypto.subtle.digest('SHA-256', response.clientDataJSON),
      catch: passkeyError('passkey.clientDataHash'),
    });
    const signedData = concatBytes(authenticatorData, new Uint8Array(clientDataHash));
    const publicKeyCryptoKey = yield* importPasskeyPublicKeyEffect(stored);
    const verified = yield* verifyPasskeySignatureEffect(
      publicKeyCryptoKey,
      stored.publicKeyAlgorithm,
      response.signature,
      signedData,
    );
    if (!verified) {
      return yield* Effect.fail(new Error('Passkey verification failed.'));
    }
  });
}

function requestPasskeyCredentialEffect(
  request: (signal: AbortSignal) => Promise<Credential | null>,
  signal: AbortSignal | undefined,
  operation: string,
): Effect.Effect<PublicKeyCredential, Error, never> {
  return Effect.tryPromise({
    try: async () => requestPasskeyCredential(request, signal),
    catch: passkeyError(operation),
  }).pipe(Effect.map(asPublicKeyCredential));
}

async function requestPasskeyCredential(
  request: (signal: AbortSignal) => Promise<Credential | null>,
  externalSignal?: AbortSignal,
): Promise<Credential | null> {
  if (externalSignal?.aborted) {
    throw passkeyRequestError('AbortError', 'Passkey request was cancelled.');
  }

  const controller = new AbortController();
  let rejectCancellation: (error: Error) => void = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });

  const cancel = (error: Error) => {
    // Settle our own promise first so this works even when a browser ignores
    // the WebAuthn signal or replaces its reason with a generic AbortError.
    rejectCancellation(error);
    if (!controller.signal.aborted) controller.abort();
  };
  const onExternalAbort = () => {
    cancel(passkeyRequestError('AbortError', 'Passkey request was cancelled.'));
  };
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  const timeout = globalThis.setTimeout(() => {
    cancel(passkeyRequestError('TimeoutError', 'Passkey request timed out. Try again.'));
  }, PASSKEY_TIMEOUT_MS);

  try {
    return await Promise.race([
      request(controller.signal),
      cancellation,
    ]);
  } catch (error) {
    if (error instanceof Error && error.name === 'NotAllowedError') {
      throw new Error('Passkey approval was cancelled or timed out. Try again.');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

function passkeyRequestError(name: 'AbortError' | 'TimeoutError', message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
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

function wrapVaultPasswordEffect(
  password: string,
  prfOutput: Uint8Array,
): Effect.Effect<{ iv: Uint8Array; ciphertext: Uint8Array }, Error, never> {
  return Effect.gen(function* () {
    const iv = yield* randomBytesEffect(AES_GCM_IV_BYTES);
    const key = yield* aesKeyFromPrfOutputEffect(prfOutput, ['encrypt']);
    const ciphertext = yield* Effect.tryPromise({
      try: async () =>
        crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: toArrayBuffer(iv) },
          key,
          toArrayBuffer(new TextEncoder().encode(password)),
        ),
      catch: passkeyError('passkey.wrapVaultPassword'),
    });
    return { iv, ciphertext: new Uint8Array(ciphertext) };
  });
}

function decryptVaultPasswordEffect(
  credential: StoredPrfPasskeyCredential,
  prfOutput: Uint8Array,
): Effect.Effect<string, Error, never> {
  return Effect.gen(function* () {
    const key = yield* aesKeyFromPrfOutputEffect(prfOutput, ['decrypt']);
    return yield* decryptVaultPasswordWithKeyEffect(credential, key);
  });
}

function wrapVaultPasswordWithKeyEffect(
  password: string,
  key: CryptoKey,
): Effect.Effect<{ iv: Uint8Array; ciphertext: Uint8Array }, Error, never> {
  return Effect.gen(function* () {
    const iv = yield* randomBytesEffect(AES_GCM_IV_BYTES);
    const ciphertext = yield* Effect.tryPromise({
      try: async () =>
        crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: toArrayBuffer(iv) },
          key,
          toArrayBuffer(new TextEncoder().encode(password)),
        ),
      catch: passkeyError('passkey.wrapVaultPasswordWithKey'),
    });
    return { iv, ciphertext: new Uint8Array(ciphertext) };
  });
}

function decryptVaultPasswordWithKeyEffect(
  credential: StoredPasskeyCredential,
  key: CryptoKey,
): Effect.Effect<string, Error, never> {
  return Effect.gen(function* () {
    const plaintext = yield* Effect.tryPromise({
      try: async () =>
        crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(credential.iv)) },
          key,
          toArrayBuffer(base64UrlToBytes(credential.wrappedVaultPassword)),
        ),
      catch: passkeyError('passkey.decryptVaultPassword'),
    });
    return new TextDecoder().decode(plaintext);
  });
}

function importPasskeyPublicKeyEffect(
  credential: StoredLocalPasskeyCredential,
): Effect.Effect<CryptoKey, Error, never> {
  const publicKey = toArrayBuffer(base64UrlToBytes(credential.publicKey));
  if (credential.publicKeyAlgorithm === ES256_ALGORITHM) {
    return Effect.tryPromise({
      try: async () =>
        crypto.subtle.importKey(
          'spki',
          publicKey,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify'],
        ),
      catch: passkeyError('passkey.importEcdsaPublicKey'),
    });
  }
  if (credential.publicKeyAlgorithm === RS256_ALGORITHM) {
    return Effect.tryPromise({
      try: async () =>
        crypto.subtle.importKey(
          'spki',
          publicKey,
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      catch: passkeyError('passkey.importRsaPublicKey'),
    });
  }
  return Effect.fail(new Error('Unsupported passkey algorithm.'));
}

function verifyPasskeySignatureEffect(
  key: CryptoKey,
  algorithm: COSEAlgorithmIdentifier,
  signature: ArrayBuffer,
  signedData: Uint8Array,
): Effect.Effect<boolean, Error, never> {
  if (algorithm === ES256_ALGORITHM) {
    return Effect.tryPromise({
      try: async () =>
        crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          key,
          toArrayBuffer(derEcdsaSignatureToRaw(new Uint8Array(signature), 32)),
          toArrayBuffer(signedData),
        ),
      catch: passkeyError('passkey.verifyEcdsaSignature'),
    });
  }
  if (algorithm === RS256_ALGORITHM) {
    return Effect.tryPromise({
      try: async () =>
        crypto.subtle.verify(
          { name: 'RSASSA-PKCS1-v1_5' },
          key,
          signature,
          toArrayBuffer(signedData),
        ),
      catch: passkeyError('passkey.verifyRsaSignature'),
    });
  }
  return Effect.succeed(false);
}

function aesKeyFromPrfOutputEffect(
  output: Uint8Array,
  usages: KeyUsage[],
): Effect.Effect<CryptoKey, Error, never> {
  return Effect.gen(function* () {
    const digest = yield* Effect.tryPromise({
      try: async () => crypto.subtle.digest('SHA-256', toArrayBuffer(output)),
      catch: passkeyError('passkey.prfDigest'),
    });
    return yield* Effect.tryPromise({
      try: async () => crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usages),
      catch: passkeyError('passkey.importAesKey'),
    });
  });
}

function storeLocalWrappingKeyEffect(keyId: string, key: CryptoKey) {
  return withLocalWrappingDbEffect((db) =>
    idbRequestEffect<IDBValidKey>(
      () => db.transaction(LOCAL_WRAPPING_STORE, 'readwrite')
        .objectStore(LOCAL_WRAPPING_STORE)
        .put(key, keyId),
    ).pipe(Effect.asVoid)
  );
}

function getLocalWrappingKeyEffect(keyId: string): Effect.Effect<CryptoKey | null, Error, never> {
  return withLocalWrappingDbEffect((db) =>
    idbRequestEffect<CryptoKey | undefined>(
      () => db.transaction(LOCAL_WRAPPING_STORE, 'readonly')
        .objectStore(LOCAL_WRAPPING_STORE)
        .get(keyId),
    ).pipe(Effect.map((key) => key ?? null))
  );
}

function withLocalWrappingDbEffect<A>(
  use: (db: IDBDatabase) => Effect.Effect<A, Error, never>,
): Effect.Effect<A, Error, never> {
  return Effect.acquireUseRelease(
    openLocalWrappingDbEffect(),
    use,
    (db) => Effect.sync(() => db.close()),
  );
}

function openLocalWrappingDbEffect(): Effect.Effect<IDBDatabase, Error, never> {
  return Effect.async<IDBDatabase, Error>((resume) => {
    const request = indexedDB.open(LOCAL_WRAPPING_DB_NAME, LOCAL_WRAPPING_DB_VERSION);
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(Effect.fail(new Error('Passkey vault storage timed out. Try again.')));
    }, PASSKEY_STORAGE_TIMEOUT_MS);
    const finish = (effect: Effect.Effect<IDBDatabase, Error>) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      resume(effect);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_WRAPPING_STORE)) {
        db.createObjectStore(LOCAL_WRAPPING_STORE);
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      finish(Effect.succeed(request.result));
    };
    request.onerror = () =>
      finish(Effect.fail(request.error ?? new Error('Failed to open passkey vault storage.')));
    request.onblocked = () =>
      finish(Effect.fail(new Error('Passkey vault storage is blocked by another tab.')));
    return Effect.sync(() => {
      settled = true;
      globalThis.clearTimeout(timeout);
    });
  });
}

function idbRequestEffect<T>(makeRequest: () => IDBRequest<T>): Effect.Effect<T, Error, never> {
  return Effect.async<T, Error>((resume) => {
    let request: IDBRequest<T>;
    try {
      request = makeRequest();
    } catch (error) {
      resume(Effect.fail(passkeyError('passkey.vaultStorage')(error)));
      return;
    }
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      finish(Effect.fail(new Error('Passkey vault storage timed out. Try again.')));
    }, PASSKEY_STORAGE_TIMEOUT_MS);
    const finish = (effect: Effect.Effect<T, Error>) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeout);
      resume(effect);
    };
    request.onsuccess = () => {
      finish(Effect.succeed(request.result));
    };
    request.onerror = () => {
      finish(Effect.fail(request.error ?? new Error('Passkey vault storage failed.')));
    };
    return Effect.sync(() => {
      settled = true;
      globalThis.clearTimeout(timeout);
    });
  });
}

function randomBytesEffect(length: number): Effect.Effect<Uint8Array<ArrayBuffer>, Error, never> {
  return Effect.try({
    try: () => {
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    },
    catch: passkeyError('passkey.randomBytes'),
  });
}

function randomBase64UrlEffect(length: number): Effect.Effect<string, Error, never> {
  return randomBytesEffect(length).pipe(
    Effect.map(bytesToBase64Url),
  );
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
