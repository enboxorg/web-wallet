import { Context, Effect, Layer } from 'effect';

import { STORAGE_KEYS } from '@/lib/constants';
import type { EnboxAgent, RegistrationTokenData } from '../types';
import { storageError } from './errors';

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
      try: () => {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.REGISTRATION_TOKENS);
        return raw ? JSON.parse(raw) as Record<string, RegistrationTokenData> : {};
      },
      catch: storageError('registrationTokens.get'),
    }).pipe(Effect.catchAll(() => Effect.succeed({}))),

    set: (tokens) =>
      Effect.try({
        try: () => {
          globalThis.localStorage?.setItem(
            STORAGE_KEYS.REGISTRATION_TOKENS,
            JSON.stringify(tokens),
          );
        },
        catch: storageError('registrationTokens.set'),
      }).pipe(Effect.catchAll(() => Effect.void)),
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
