import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canCreatePasskeyVault,
  canUsePasskeyUnlock,
  clearPasskeyCredential,
  createPasskeyVault,
  getStoredAuthMethod,
  hasStoredPasskeyCredential,
  markPinAuthMethod,
  PasskeyVaultUnsupportedError,
  preparePasskeyVaultPassword,
  replacePasskeyVault,
  storePasskeyCredential,
  unlockWithStoredPasskey,
} from '../passkeys';
import {
  AUTH_METHOD_STORAGE_KEY,
  PASSKEY_CREDENTIAL_STORAGE_KEY,
} from '../constants';

const credential = {
  version: 1 as const,
  wrapping: 'prf' as const,
  credentialId: 'credential-id',
  salt: 'salt',
  iv: 'iv',
  wrappedVaultPassword: 'wrapped',
  createdAt: '2026-06-20T00:00:00.000Z',
};

describe('passkeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reports passkey creation unavailable when WebAuthn is missing', () => {
    expect(canCreatePasskeyVault()).toBe(false);
    expect(canUsePasskeyUnlock()).toBe(false);
  });

  it('stores passkey metadata and marks passkey as the auth method', () => {
    storePasskeyCredential(credential);

    expect(hasStoredPasskeyCredential()).toBe(true);
    expect(getStoredAuthMethod()).toBe('passkey');
    expect(localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY)).toContain('credential-id');
  });

  it('stores passkey metadata before activating its vault password', async () => {
    stubPasskeyRegistrationWithoutPrf();
    const activate = vi.fn(async (password: string) => {
      expect(hasStoredPasskeyCredential()).toBe(true);
      expect(getStoredAuthMethod()).toBe('passkey');
      expect(password).toEqual(expect.any(String));
      return 'activated';
    });

    await expect(createPasskeyVault(activate)).resolves.toBe('activated');

    expect(activate).toHaveBeenCalledOnce();
  });

  it('keeps passkey metadata when vault activation fails after a possible commit', async () => {
    stubPasskeyRegistrationWithoutPrf();
    const activationError = new Error('session finalization failed');

    await expect(createPasskeyVault(
      async () => { throw activationError; },
    )).rejects.toBe(activationError);

    expect(hasStoredPasskeyCredential()).toBe(true);
    expect(getStoredAuthMethod()).toBe('passkey');
  });

  it('restores the working PIN when recovery rejects before changing the vault password', async () => {
    markPinAuthMethod();
    stubPasskeyRegistrationWithoutPrf();
    const recoveryError = new Error('Recovery phrase does not match');

    await expect(replacePasskeyVault(
      async () => { throw recoveryError; },
    )).rejects.toBe(recoveryError);

    expect(hasStoredPasskeyCredential()).toBe(false);
    expect(getStoredAuthMethod()).toBe('pin');
  });

  it('keeps the replacement passkey after the recovered vault changes its password', async () => {
    storePasskeyCredential({ ...credential, credentialId: 'CQk' });
    const previousCredential = localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY);
    stubPasskeyRegistrationWithoutPrf();
    const finalizationError = new Error('Remote recovery failed');

    await expect(replacePasskeyVault(
      async (_password, onVaultPasswordCommitted) => {
        expect(localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY))
          .not.toBe(previousCredential);
        onVaultPasswordCommitted();
        throw finalizationError;
      },
    )).rejects.toBe(finalizationError);

    expect(hasStoredPasskeyCredential()).toBe(true);
    expect(getStoredAuthMethod()).toBe('passkey');
    expect(localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY))
      .not.toBe(previousCredential);
  });

  it('does not activate the vault when passkey metadata cannot be stored', async () => {
    stubPasskeyRegistrationWithoutPrf();
    const storageError = new Error('storage unavailable');
    const setItem = vi.spyOn(localStorage, 'setItem')
      .mockImplementation(() => { throw storageError; });
    const activate = vi.fn(async () => undefined);

    try {
      await expect(createPasskeyVault(activate)).rejects.toBe(storageError);
      expect(activate).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });

  it('clears passkey metadata and passkey auth method', () => {
    storePasskeyCredential(credential);

    clearPasskeyCredential();

    expect(hasStoredPasskeyCredential()).toBe(false);
    expect(getStoredAuthMethod()).toBeNull();
  });

  it('markPinAuthMethod removes passkey metadata and stores pin as the auth method', () => {
    storePasskeyCredential(credential);

    markPinAuthMethod();

    expect(localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_METHOD_STORAGE_KEY)).toBe('pin');
    expect(getStoredAuthMethod()).toBe('pin');
  });

  it('uses the synchronous runtime check without polling platform-authenticator support', () => {
    const { supportCheck } = stubWebAuthnCapabilities();

    expect(canCreatePasskeyVault()).toBe(true);
    expect(supportCheck).not.toHaveBeenCalled();
  });

  it('maps a provider without passkey creation to the PIN fallback error', async () => {
    const { create, supportCheck } = stubWebAuthnCapabilities();
    supportCheck.mockResolvedValue(true);
    create.mockRejectedValue(new DOMException('Not supported', 'NotSupportedError'));

    await expect(preparePasskeyVaultPassword()).rejects.toBeInstanceOf(
      PasskeyVaultUnsupportedError,
    );
  });

  it('falls back before starting WebAuthn when no platform authenticator exists', async () => {
    const { create, supportCheck } = stubWebAuthnCapabilities();
    supportCheck.mockResolvedValue(false);

    await expect(preparePasskeyVaultPassword()).rejects.toBeInstanceOf(
      PasskeyVaultUnsupportedError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('stops waiting for a hung capability hint and starts WebAuthn directly', async () => {
    vi.useFakeTimers();
    const { create, supportCheck } = stubPasskeyRegistrationWithoutPrf();
    supportCheck.mockImplementation(() => new Promise<boolean>(() => undefined));

    const preparation = preparePasskeyVaultPassword();
    await vi.waitFor(() => expect(supportCheck).toHaveBeenCalledOnce());
    expect(create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(preparation).resolves.toEqual(expect.objectContaining({
      password: expect.any(String),
    }));
    expect(create).toHaveBeenCalledOnce();
  });

  it('falls back to local passkey wrapping when the authenticator does not process PRF', async () => {
    const { create } = stubPasskeyRegistrationWithoutPrf();

    const prepared = await preparePasskeyVaultPassword();

    expect(prepared.password).toEqual(expect.any(String));
    expect(prepared.credential).toMatchObject({
      version: 2,
      wrapping: 'local',
      credentialId: expect.any(String),
      publicKey: expect.any(String),
      publicKeyAlgorithm: -7,
      keyId: expect.any(String),
      iv: expect.any(String),
      wrappedVaultPassword: expect.any(String),
      createdAt: expect.any(String),
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it('ends a pending passkey creation request at the hard deadline', async () => {
    vi.useFakeTimers();
    const create = stubPendingPasskeyRegistration();

    const preparation = preparePasskeyVaultPassword();
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    const rejection = expect(preparation).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Passkey request timed out. Try again.',
    });

    await vi.advanceTimersByTimeAsync(60_000);

    await rejection;
    expect(create.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });

  it('unlocks local passkey wrapping after verifying the passkey assertion', async () => {
    storeLocalPasskeyMetadata();
    const wrappingKey = { type: 'secret' };
    const { get, supportCheck } = stubLocalPasskeyUnlock(wrappingKey);

    await expect(unlockWithStoredPasskey()).resolves.toBe('vault-password');

    expect(supportCheck).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it('aborts a pending browser request when its caller is cancelled', async () => {
    storeLocalPasskeyMetadata();
    const get = stubPendingPasskeyUnlock();
    const controller = new AbortController();

    const unlockPromise = unlockWithStoredPasskey(controller.signal);
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());

    const browserSignal = get.mock.calls[0]?.[0].signal;
    controller.abort();

    await expect(unlockPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Passkey request was cancelled.',
    });
    expect(browserSignal?.aborted).toBe(true);
  });

  it('ends a passkey request at the hard deadline', async () => {
    vi.useFakeTimers();
    storeLocalPasskeyMetadata();
    const get = stubPendingPasskeyUnlock();

    const unlockPromise = unlockWithStoredPasskey();
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    const rejection = expect(unlockPromise).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'Passkey request timed out. Try again.',
    });

    await vi.advanceTimersByTimeAsync(60_000);

    await rejection;
    expect(get.mock.calls[0]?.[0].signal.aborted).toBe(true);
  });

  it('fails instead of hanging when local passkey vault storage stalls', async () => {
    vi.useFakeTimers();
    storeLocalPasskeyMetadata();
    const indexedDb = createPendingIndexedDb();
    stubLocalPasskeyUnlock({ type: 'secret' }, indexedDb);

    const unlockPromise = unlockWithStoredPasskey();
    await vi.advanceTimersByTimeAsync(0);
    expect(indexedDb.open).toHaveBeenCalledOnce();
    const rejection = expect(unlockPromise).rejects.toThrow(
      'Passkey vault storage timed out. Try again.',
    );

    await vi.advanceTimersByTimeAsync(10_001);

    await rejection;
  });
});

function storeLocalPasskeyMetadata() {
  const credentialId = new Uint8Array([1, 2, 3, 4]);
  const publicKey = new Uint8Array([5, 6, 7, 8]);
  const iv = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  const wrappedVaultPassword = new Uint8Array([21, 22, 23]);

  localStorage.setItem(
    PASSKEY_CREDENTIAL_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      wrapping: 'local',
      credentialId: bytesToBase64Url(credentialId),
      publicKey: bytesToBase64Url(publicKey),
      publicKeyAlgorithm: -257,
      keyId: 'local-key',
      iv: bytesToBase64Url(iv),
      wrappedVaultPassword: bytesToBase64Url(wrappedVaultPassword),
      createdAt: '2026-06-20T00:00:00.000Z',
    }),
  );
}

function stubWebAuthnCapabilities() {
  const supportCheck = vi.fn(() => new Promise<boolean>(() => undefined));
  const create = vi.fn();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: supportCheck,
  });
  vi.stubGlobal('navigator', {
    credentials: {
      create,
      get: vi.fn(),
    },
  });
  vi.stubGlobal('crypto', {
    subtle: {},
    getRandomValues: vi.fn(),
  });
  vi.stubGlobal('indexedDB', {
    open: vi.fn(),
  });
  return { create, supportCheck };
}

function stubPasskeyRegistrationWithoutPrf() {
  const rawId = new Uint8Array([1, 2, 3, 4]).buffer;
  const publicKey = new Uint8Array([5, 6, 7, 8]).buffer;
  const supportCheck = vi.fn().mockResolvedValue(true);

  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: supportCheck,
  });
  const create = vi.fn().mockResolvedValue({
    type: 'public-key',
    rawId,
    response: {
      getPublicKey: vi.fn(() => publicKey),
      getPublicKeyAlgorithm: vi.fn(() => -7),
    },
    getClientExtensionResults: vi.fn(() => ({ prf: { enabled: false } })),
  });
  vi.stubGlobal('navigator', {
    credentials: {
      create,
      get: vi.fn(),
    },
  });
  vi.stubGlobal('crypto', {
    subtle: {
      generateKey: vi.fn().mockResolvedValue({ type: 'secret' }),
      encrypt: vi.fn().mockResolvedValue(new Uint8Array([9, 10, 11]).buffer),
    },
    getRandomValues: vi.fn((bytes: Uint8Array) => {
      bytes.fill(7);
      return bytes;
    }),
  });
  vi.stubGlobal('indexedDB', createFakeIndexedDb());
  return { create, supportCheck };
}

function stubPendingPasskeyRegistration() {
  const create = vi.fn((request: CredentialCreationOptions) =>
    new Promise<Credential | null>((_resolve, reject) => {
      request.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted', 'AbortError')),
        { once: true },
      );
    }));

  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {});
  vi.stubGlobal('navigator', { credentials: { create, get: vi.fn() } });
  vi.stubGlobal('crypto', {
    subtle: {},
    getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(7)),
  });
  vi.stubGlobal('indexedDB', createFakeIndexedDb());

  return create;
}

function stubLocalPasskeyUnlock(
  wrappingKey: unknown,
  indexedDb: unknown = createFakeIndexedDb({ getResult: wrappingKey }),
) {
  const plaintext = new TextEncoder().encode('vault-password');
  const supportCheck = vi.fn().mockResolvedValue(false);
  const get = vi.fn((request: CredentialRequestOptions) => {
    const challenge = new Uint8Array(request.publicKey?.challenge as ArrayBuffer);
    const authenticatorData = new Uint8Array(33);
    authenticatorData[32] = 0x05;
    return Promise.resolve({
      type: 'public-key',
      rawId: toArrayBuffer(new Uint8Array([1, 2, 3, 4])),
      response: {
        clientDataJSON: toArrayBuffer(
          new TextEncoder().encode(JSON.stringify({
            type: 'webauthn.get',
            challenge: bytesToBase64Url(challenge),
          })),
        ),
        authenticatorData: toArrayBuffer(authenticatorData),
        signature: toArrayBuffer(new Uint8Array([24, 25, 26])),
      },
      getClientExtensionResults: vi.fn(() => ({})),
    });
  });

  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: supportCheck,
  });
  vi.stubGlobal('navigator', {
    credentials: {
      create: vi.fn(),
      get,
    },
  });
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn().mockResolvedValue(toArrayBuffer(new Uint8Array([27, 28, 29]))),
      importKey: vi.fn().mockResolvedValue({ type: 'public' }),
      verify: vi.fn().mockResolvedValue(true),
      decrypt: vi.fn().mockResolvedValue(toArrayBuffer(plaintext)),
    },
    getRandomValues: vi.fn((bytes: Uint8Array) => {
      bytes.fill(7);
      return bytes;
    }),
  });
  vi.stubGlobal('indexedDB', indexedDb);

  return { get, supportCheck };
}

function stubPendingPasskeyUnlock() {
  const get = vi.fn((request: CredentialRequestOptions) =>
    new Promise<Credential | null>((_resolve, reject) => {
      request.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted', 'AbortError')),
        { once: true },
      );
    }));

  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {});
  vi.stubGlobal('navigator', { credentials: { get } });
  vi.stubGlobal('crypto', {
    subtle: {},
    getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(7)),
  });
  vi.stubGlobal('indexedDB', createFakeIndexedDb());

  return get;
}

function createPendingIndexedDb() {
  return {
    open: vi.fn(() => ({
      result: undefined,
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      onblocked: null,
    })),
  };
}

function createFakeIndexedDb(options: { getResult?: unknown; putResult?: unknown } = {}) {
  return {
    open: vi.fn(() => {
      const store = {
        get: vi.fn(() => successRequest(options.getResult)),
        put: vi.fn(() => successRequest(options.putResult ?? 'stored-key')),
      };
      const db = {
        objectStoreNames: {
          contains: vi.fn(() => true),
        },
        createObjectStore: vi.fn(),
        transaction: vi.fn(() => ({
          objectStore: vi.fn(() => store),
        })),
        close: vi.fn(),
      };
      const request = successRequest(db) as any;
      return request;
    }),
  };
}

function successRequest<T>(result: T) {
  const request = {
    result,
    error: null,
    onsuccess: null as ((event: Event) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onupgradeneeded: null as ((event: Event) => void) | null,
    onblocked: null as ((event: Event) => void) | null,
  };
  queueMicrotask(() => request.onsuccess?.(new Event('success')));
  return request;
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
}
