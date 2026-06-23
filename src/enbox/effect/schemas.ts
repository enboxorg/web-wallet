import { Effect, Schema } from 'effect';

import type { RegistrationTokenData } from '../types';
import { storageError } from './errors';

export const DidUriSchema = Schema.String.pipe(
  Schema.filter((value) => value.startsWith('did:'), {
    message: () => 'Expected DID URI',
  }),
);

export const UrlStringSchema = Schema.String.pipe(
  Schema.filter((value) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, {
    message: () => 'Expected absolute URL',
  }),
);

export const RegistrationTokenDataSchema = Schema.Struct({
  registrationToken : Schema.String,
  refreshToken      : Schema.optional(Schema.String),
  expiresAt         : Schema.optional(Schema.Number),
  tokenUrl          : UrlStringSchema,
  refreshUrl        : Schema.optional(UrlStringSchema),
});

export const RegistrationTokensSchema = Schema.Record({
  key   : UrlStringSchema,
  value : RegistrationTokenDataSchema,
});

export const RegistrationTokensJsonSchema = Schema.parseJson(RegistrationTokensSchema);

export function decodeRegistrationTokensJsonEffect(
  raw: string | null | undefined,
) {
  if (!raw) {
    return Effect.succeed({} as Record<string, RegistrationTokenData>);
  }

  return Schema.decodeUnknown(RegistrationTokensJsonSchema)(raw).pipe(
    Effect.map((tokens) => tokens as Record<string, RegistrationTokenData>),
    Effect.mapError(storageError('registrationTokens.decode')),
  );
}

export function encodeRegistrationTokensJsonEffect(
  tokens: Record<string, RegistrationTokenData>,
) {
  return Schema.encode(RegistrationTokensJsonSchema)(tokens).pipe(
    Effect.mapError(storageError('registrationTokens.encode')),
  );
}
