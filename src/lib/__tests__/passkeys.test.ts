import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canCheckPasskeySupport,
  clearPasskeyCredential,
  getStoredAuthMethod,
  hasStoredPasskeyCredential,
  isPasskeySupported,
  markPinAuthMethod,
  preparePasskeyVaultPassword,
  storePasskeyCredential,
  unlockWithStoredPasskey,
} from '../passkeys';
import {
  AUTH_METHOD_STORAGE_KEY,
  PASSKEY_CREDENTIAL_STORAGE_KEY,
} from '../constants';

const credential = {
  version: 1 as const,
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
    vi.unstubAllGlobals();
  });

  it('reports passkey checks unavailable when WebAuthn is missing', () => {
    expect(canCheckPasskeySupport()).toBe(false);
  });

  it('stores passkey metadata and marks passkey as the auth method', () => {
    storePasskeyCredential(credential);

    expect(hasStoredPasskeyCredential()).toBe(true);
    expect(getStoredAuthMethod()).toBe('passkey');
    expect(localStorage.getItem(PASSKEY_CREDENTIAL_STORAGE_KEY)).toContain('credential-id');
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

  it('reports passkey support when PRF is unavailable because local wrapping can be used', async () => {
    stubWebAuthnCapabilities({ 'extension:prf': false });

    expect(canCheckPasskeySupport()).toBe(true);
    await expect(isPasskeySupported()).resolves.toBe(true);
  });

  it('reports passkey support when a platform authenticator and PRF extension are available', async () => {
    stubWebAuthnCapabilities({ 'extension:prf': true });

    await expect(isPasskeySupported()).resolves.toBe(true);
  });

  it('falls back to local passkey wrapping when the authenticator does not process PRF', async () => {
    stubPasskeyRegistrationWithoutPrf();

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
  });

  it('unlocks local passkey wrapping after verifying the passkey assertion', async () => {
    const credentialId = new Uint8Array([1, 2, 3, 4]);
    const publicKey = new Uint8Array([5, 6, 7, 8]);
    const iv = new Uint8Array([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const wrappedVaultPassword = new Uint8Array([21, 22, 23]);
    const wrappingKey = { type: 'secret' };
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
    stubLocalPasskeyUnlock(wrappingKey);

    await expect(unlockWithStoredPasskey()).resolves.toBe('vault-password');
  });
});

function stubWebAuthnCapabilities(capabilities: Record<string, boolean>) {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
    getClientCapabilities: vi.fn().mockResolvedValue(capabilities),
  });
  vi.stubGlobal('navigator', {
    credentials: {
      create: vi.fn(),
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
}

function stubPasskeyRegistrationWithoutPrf() {
  const rawId = new Uint8Array([1, 2, 3, 4]).buffer;
  const publicKey = new Uint8Array([5, 6, 7, 8]).buffer;

  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
  });
  vi.stubGlobal('navigator', {
    credentials: {
      create: vi.fn().mockResolvedValue({
        type: 'public-key',
        rawId,
        response: {
          getPublicKey: vi.fn(() => publicKey),
          getPublicKeyAlgorithm: vi.fn(() => -7),
        },
        getClientExtensionResults: vi.fn(() => ({ prf: { enabled: false } })),
      }),
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
}

function stubLocalPasskeyUnlock(wrappingKey: unknown) {
  const plaintext = new TextEncoder().encode('vault-password');

  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('PublicKeyCredential', {
    isUserVerifyingPlatformAuthenticatorAvailable: vi.fn().mockResolvedValue(true),
  });
  vi.stubGlobal('navigator', {
    credentials: {
      create: vi.fn(),
      get: vi.fn((request: CredentialRequestOptions) => {
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
      }),
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
  vi.stubGlobal('indexedDB', createFakeIndexedDb({ getResult: wrappingKey }));
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
