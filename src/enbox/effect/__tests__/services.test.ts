import { Convert } from '@enbox/common';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@/lib/constants';
import { runEnboxPromise } from '../runtime';
import {
  REGISTRATION_TOKENS_SECRET_KEY,
  RegistrationTokenStore,
  registrationTokenStoreLayer,
} from '../services';

const tokens = {
  'https://dwn.example': {
    registrationToken : 'registration-token',
    refreshToken      : 'refresh-token',
    expiresAt         : 123,
    tokenUrl          : 'https://provider.example/token',
    refreshUrl        : 'https://provider.example/refresh',
  },
};

function readTokens(agent: any) {
  return runEnboxPromise(
    Effect.gen(function* () {
      const store = yield* RegistrationTokenStore;
      return yield* store.get;
    }).pipe(Effect.provide(registrationTokenStoreLayer(agent))),
  );
}

function writeTokens(agent: any) {
  return runEnboxPromise(
    Effect.gen(function* () {
      const store = yield* RegistrationTokenStore;
      yield* store.set(tokens);
    }).pipe(Effect.provide(registrationTokenStoreLayer(agent))),
  );
}

describe('registrationTokenStoreLayer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates legacy plaintext tokens into the vault-backed secret store', async () => {
    let encryptedTokens: Uint8Array | undefined;
    const agent = {
      secrets: {
        get: vi.fn(async () => encryptedTokens),
        put: vi.fn(async (_key: string, value: Uint8Array) => {
          encryptedTokens = value;
        }),
      },
    };
    localStorage.setItem(STORAGE_KEYS.REGISTRATION_TOKENS, JSON.stringify(tokens));

    await expect(readTokens(agent)).resolves.toEqual(tokens);
    expect(agent.secrets.put).toHaveBeenCalledWith(
      REGISTRATION_TOKENS_SECRET_KEY,
      expect.any(Uint8Array),
    );
    expect(JSON.parse(Convert.uint8Array(encryptedTokens!).toString())).toEqual(tokens);
    expect(localStorage.getItem(STORAGE_KEYS.REGISTRATION_TOKENS)).toBeNull();
    await expect(readTokens(agent)).resolves.toEqual(tokens);
  });

  it('never falls back to plaintext when saving tokens', async () => {
    const agent = {
      secrets: {
        get: vi.fn(async () => undefined),
        put: vi.fn(async () => undefined),
      },
    };
    localStorage.setItem(STORAGE_KEYS.REGISTRATION_TOKENS, 'legacy');

    await writeTokens(agent);

    expect(agent.secrets.put).toHaveBeenCalledWith(
      REGISTRATION_TOKENS_SECRET_KEY,
      expect.any(Uint8Array),
    );
    expect(localStorage.getItem(STORAGE_KEYS.REGISTRATION_TOKENS)).toBeNull();
  });

  it('reports a vault failure when registration tokens cannot be saved', async () => {
    const agent = {
      secrets: {
        get: vi.fn(async () => undefined),
        put: vi.fn(async () => { throw new Error('vault locked'); }),
      },
    };

    await expect(writeTokens(agent)).rejects.toThrow('vault locked');
  });

  it('merges disjoint plaintext tokens into an existing vault copy', async () => {
    const encryptedTokens = Convert.string(JSON.stringify(tokens)).toUint8Array();
    const legacyTokens = {
      'https://legacy.example': {
        registrationToken : 'legacy-registration-token',
        refreshToken      : 'legacy-refresh-token',
        expiresAt         : 456,
        tokenUrl          : 'https://legacy.example/token',
        refreshUrl        : 'https://legacy.example/refresh',
      },
    };
    let savedTokens: Uint8Array | undefined;
    const agent = {
      secrets: {
        get: vi.fn(async () => encryptedTokens),
        put: vi.fn(async (_key: string, value: Uint8Array) => {
          savedTokens = value;
        }),
      },
    };
    localStorage.setItem(STORAGE_KEYS.REGISTRATION_TOKENS, JSON.stringify(legacyTokens));

    await expect(readTokens(agent)).resolves.toEqual({ ...legacyTokens, ...tokens });
    expect(JSON.parse(Convert.uint8Array(savedTokens!).toString())).toEqual({
      ...legacyTokens,
      ...tokens,
    });
    expect(localStorage.getItem(STORAGE_KEYS.REGISTRATION_TOKENS)).toBeNull();
  });

  it('does not replace vault tokens when the secret store cannot be read', async () => {
    const agent = {
      secrets: {
        get: vi.fn(async () => { throw new Error('vault locked'); }),
        put: vi.fn(async () => undefined),
      },
    };
    localStorage.setItem(STORAGE_KEYS.REGISTRATION_TOKENS, JSON.stringify(tokens));

    await expect(readTokens(agent)).rejects.toThrow('vault locked');
    expect(agent.secrets.put).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEYS.REGISTRATION_TOKENS)).toBe(JSON.stringify(tokens));
  });
});
