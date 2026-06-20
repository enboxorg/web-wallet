import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canCheckPasskeySupport,
  clearPasskeyCredential,
  getStoredAuthMethod,
  hasStoredPasskeyCredential,
  isPasskeySupported,
  markPinAuthMethod,
  storePasskeyCredential,
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

  it('does not report passkey support when the PRF extension is unavailable', async () => {
    stubWebAuthnCapabilities({ 'extension:prf': false });

    expect(canCheckPasskeySupport()).toBe(true);
    await expect(isPasskeySupported()).resolves.toBe(false);
  });

  it('reports passkey support when a platform authenticator and PRF extension are available', async () => {
    stubWebAuthnCapabilities({ 'extension:prf': true });

    await expect(isPasskeySupported()).resolves.toBe(true);
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
}
