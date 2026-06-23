import { Context, Effect, Layer } from 'effect';

import { STORAGE_KEYS } from '@/lib/constants';
import type { EnboxAgent, RegistrationTokenData } from '../types';
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
    never
  >;
  readonly set: (
    tokens: Record<string, RegistrationTokenData>,
  ) => Effect.Effect<void, never>;
}

export class RegistrationTokenStore extends Context.Tag('enbox/RegistrationTokenStore')<
  RegistrationTokenStore,
  RegistrationTokenStoreService
>() {}

export function currentAgentLayer(agent: EnboxAgent) {
  return Layer.succeed(CurrentAgent, agent);
}

export const BrowserRegistrationTokenStoreLive = Layer.succeed(
  RegistrationTokenStore,
  {
    get: Effect.try({
      try: () => globalThis.localStorage?.getItem(STORAGE_KEYS.REGISTRATION_TOKENS) ?? null,
      catch: storageError('registrationTokens.get'),
    }).pipe(
      Effect.flatMap(decodeRegistrationTokensJsonEffect),
      Effect.catchAll(() => Effect.succeed({})),
    ),

    set: (tokens) =>
      encodeRegistrationTokensJsonEffect(tokens).pipe(
        Effect.flatMap((serialized) =>
          Effect.try({
            try: () => {
              globalThis.localStorage?.setItem(
                STORAGE_KEYS.REGISTRATION_TOKENS,
                serialized,
              );
            },
            catch: storageError('registrationTokens.set'),
          })
        ),
        Effect.catchAll(() => Effect.void),
      ),
  },
);

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
  return Layer.merge(currentAgentLayer(agent), BrowserRegistrationTokenStoreLive);
}
