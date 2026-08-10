import { Schema } from 'effect';

export function getUnknownErrorMessage(error: unknown, fallback = 'Unknown error'): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.length > 0
  ) {
    return error.message;
  }
  return fallback;
}

export class EnboxSdkError extends Schema.TaggedError<EnboxSdkError>('EnboxSdkError')(
  'EnboxSdkError',
  {
    operation : Schema.String,
    cause     : Schema.Unknown,
    message   : Schema.String,
  },
) {}

export class EnboxStorageError extends Schema.TaggedError<EnboxStorageError>('EnboxStorageError')(
  'EnboxStorageError',
  {
    operation : Schema.String,
    cause     : Schema.Unknown,
    message   : Schema.String,
  },
) {}

export class DwnRegistrationError extends Schema.TaggedError<DwnRegistrationError>('DwnRegistrationError')(
  'DwnRegistrationError',
  {
    operation : Schema.String,
    endpoint  : Schema.optional(Schema.String),
    did       : Schema.optional(Schema.String),
    cause     : Schema.Unknown,
    message   : Schema.String,
  },
) {}

export class IdentityPublishError extends Schema.TaggedError<IdentityPublishError>('IdentityPublishError')(
  'IdentityPublishError',
  {
    did     : Schema.String,
    message : Schema.String,
  },
) {}

export class IdentityNotFoundError extends Schema.TaggedError<IdentityNotFoundError>('IdentityNotFoundError')(
  'IdentityNotFoundError',
  {
    did     : Schema.String,
    message : Schema.String,
  },
) {}

export class DuplicateIdentityError extends Schema.TaggedError<DuplicateIdentityError>('DuplicateIdentityError')(
  'DuplicateIdentityError',
  {
    did     : Schema.String,
    message : Schema.String,
  },
) {}

export type EnboxEffectError =
  | EnboxSdkError
  | EnboxStorageError
  | DwnRegistrationError
  | IdentityPublishError
  | IdentityNotFoundError
  | DuplicateIdentityError;

export function sdkError(operation: string) {
  return (cause: unknown) =>
    new EnboxSdkError({
      operation,
      cause,
      message: getUnknownErrorMessage(cause, `${operation} failed`),
    });
}

export function storageError(operation: string) {
  return (cause: unknown) =>
    new EnboxStorageError({
      operation,
      cause,
      message: getUnknownErrorMessage(cause, `${operation} failed`),
    });
}

export function registrationError(
  operation: string,
  endpoint?: string,
  did?: string,
) {
  return (cause: unknown) =>
    new DwnRegistrationError({
      operation,
      endpoint,
      did,
      cause,
      message: getUnknownErrorMessage(cause, `${operation} failed`),
    });
}

export function enboxEffectErrorToError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(getUnknownErrorMessage(error));
}
