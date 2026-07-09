import { Context, Effect, Layer } from 'effect';
import { Convert } from '@enbox/common';

import { STORAGE_KEYS } from '@/lib/constants';
import { localStorageGetEffect, localStorageRemoveEffect } from '@/lib/browser-effects';
import type { EnboxAgent, RegistrationTokenData } from '../types';
import type { EnboxStorageError } from './errors';
import { storageError } from './errors';
import {
  decodeRegistrationTokensJsonEffect,
  encodeRegistrationTokensJsonEffect,
} from './schemas';

export class CurrentAgent extends Context.Tag('enbox/CurrentAgent')<
  CurrentAgent,
  EnboxAgent
>() {}

export interface RegistrationTokenStoreService {
  readonly get: Effect.Effect<
    Record<string, RegistrationTokenData>,
    EnboxStorageError
  >;
  readonly set: (
    tokens: Record<string, RegistrationTokenData>,
  ) => Effect.Effect<void, EnboxStorageError>;
}

export class RegistrationTokenStore extends Context.Tag('enbox/RegistrationTokenStore')<
  RegistrationTokenStore,
  RegistrationTokenStoreService
>() {}

export const REGISTRATION_TOKENS_SECRET_KEY = 'enbox:auth:registrationTokens';

export function currentAgentLayer(agent: EnboxAgent) {
  return Layer.succeed(CurrentAgent, agent);
}

export function registrationTokenStoreLayer(agent: EnboxAgent) {
  return Layer.succeed(
    RegistrationTokenStore,
    {
      get: Effect.gen(function* () {
        const encryptedBytes = yield* Effect.tryPromise({
          try: async () => agent.secrets.get(REGISTRATION_TOKENS_SECRET_KEY),
          catch: storageError('registrationTokens.secret.get'),
        });
        if (encryptedBytes !== undefined) {
          const encryptedTokens = yield* decodeRegistrationTokensJsonEffect(
            Convert.uint8Array(encryptedBytes).toString(),
          );
          // Temporary compatibility migration; removal is tracked in
          // enboxorg/web-wallet#158.
          const legacySerialized = yield* localStorageGetEffect(
            STORAGE_KEYS.REGISTRATION_TOKENS,
          ).pipe(
            Effect.catchAll(() => Effect.succeed(null)),
          );
          if (legacySerialized === null) {
            return encryptedTokens;
          }

          const legacyTokens = yield* decodeRegistrationTokensJsonEffect(
            legacySerialized,
          ).pipe(
            Effect.catchAll(() => Effect.succeed({})),
          );
          const tokens = { ...legacyTokens, ...encryptedTokens };
          const serialized = yield* encodeRegistrationTokensJsonEffect(tokens);
          yield* Effect.tryPromise({
            try: async () => agent.secrets.put(
              REGISTRATION_TOKENS_SECRET_KEY,
              Convert.string(serialized).toUint8Array(),
            ),
            catch: storageError('registrationTokens.secret.migrate'),
          });
          yield* localStorageRemoveEffect(STORAGE_KEYS.REGISTRATION_TOKENS).pipe(
            Effect.catchAll(() => Effect.void),
          );
          return tokens;
        }

        const legacySerialized = yield* localStorageGetEffect(STORAGE_KEYS.REGISTRATION_TOKENS);
        const tokens = yield* decodeRegistrationTokensJsonEffect(legacySerialized);
        if (legacySerialized !== null) {
          const serialized = yield* encodeRegistrationTokensJsonEffect(tokens);
          yield* Effect.tryPromise({
            try: async () => agent.secrets.put(
              REGISTRATION_TOKENS_SECRET_KEY,
              Convert.string(serialized).toUint8Array(),
            ),
            catch: storageError('registrationTokens.secret.migrate'),
          });
          yield* localStorageRemoveEffect(STORAGE_KEYS.REGISTRATION_TOKENS).pipe(
            Effect.catchAll(() => Effect.void),
          );
        }
        return tokens;
      }),

      set: (tokens) =>
        encodeRegistrationTokensJsonEffect(tokens).pipe(
          Effect.flatMap((serialized) => Effect.tryPromise({
            try: async () => agent.secrets.put(
              REGISTRATION_TOKENS_SECRET_KEY,
              Convert.string(serialized).toUint8Array(),
            ),
            catch: storageError('registrationTokens.secret.set'),
          })),
          Effect.tap(() =>
            localStorageRemoveEffect(STORAGE_KEYS.REGISTRATION_TOKENS)
          ),
        ),
    },
  );
}

export function memoryRegistrationTokenStoreLayer(
  initialTokens: Record<string, RegistrationTokenData> = {},
) {
  let tokens = { ...initialTokens };

  return Layer.succeed(RegistrationTokenStore, {
    get: Effect.sync(() => ({ ...tokens })),
    set: (nextTokens) =>
      Effect.sync(() => {
        tokens = { ...nextTokens };
      }),
  });
}

export function enboxLiveLayer(agent: EnboxAgent) {
  return Layer.merge(currentAgentLayer(agent), registrationTokenStoreLayer(agent));
}
