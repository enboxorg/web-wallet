import { Context, Effect, Layer } from 'effect';

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
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function currentAgentLayer(agent: EnboxAgent) {
  return Layer.succeed(CurrentAgent, agent);
}

export function registrationTokenStoreLayer(agent: EnboxAgent) {
  return Layer.succeed(
    RegistrationTokenStore,
    {
      get: Effect.gen(function* () {
        const encryptedBytes = yield* Effect.tryPromise({
          try: () => agent.secrets.get(REGISTRATION_TOKENS_SECRET_KEY),
          catch: storageError('registrationTokens.secret.get'),
        });
        return yield* decodeRegistrationTokensJsonEffect(
          encryptedBytes === undefined ? undefined : textDecoder.decode(encryptedBytes),
        );
      }),

      set: (tokens) =>
        encodeRegistrationTokensJsonEffect(tokens).pipe(
          Effect.flatMap((serialized) => Effect.tryPromise({
            try: () => agent.secrets.put(
              REGISTRATION_TOKENS_SECRET_KEY,
              textEncoder.encode(serialized),
            ),
            catch: storageError('registrationTokens.secret.set'),
          })),
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
