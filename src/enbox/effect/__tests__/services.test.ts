import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

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
  it('reads and writes tokens through the vault-backed secret store', async () => {
    let encryptedTokens: Uint8Array | undefined;
    const agent = {
      secrets: {
        get: vi.fn(async () => encryptedTokens),
        put: vi.fn(async (_key: string, value: Uint8Array) => {
          encryptedTokens = value;
        }),
      },
    };

    await expect(readTokens(agent)).resolves.toEqual({});
    await writeTokens(agent);
    expect(agent.secrets.put).toHaveBeenCalledWith(
      REGISTRATION_TOKENS_SECRET_KEY,
      expect.any(Uint8Array),
    );
    expect(JSON.parse(new TextDecoder().decode(encryptedTokens))).toEqual(tokens);
    await expect(readTokens(agent)).resolves.toEqual(tokens);
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

  it('reports a vault failure when registration tokens cannot be read', async () => {
    const agent = {
      secrets: {
        get: vi.fn(async () => { throw new Error('vault locked'); }),
        put: vi.fn(async () => undefined),
      },
    };

    await expect(readTokens(agent)).rejects.toThrow('vault locked');
    expect(agent.secrets.put).not.toHaveBeenCalled();
  });
});
