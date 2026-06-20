import { Data } from 'effect';

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

export class EnboxSdkError extends Data.TaggedError('EnboxSdkError')<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class EnboxStorageError extends Data.TaggedError('EnboxStorageError')<{
  readonly operation: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class DwnRegistrationError extends Data.TaggedError('DwnRegistrationError')<{
  readonly operation: string;
  readonly endpoint?: string;
  readonly did?: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class ProtocolInstallationError extends Data.TaggedError('ProtocolInstallationError')<{
  readonly protocol: string;
  readonly statusCode?: number;
  readonly statusDetail?: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export class IdentityPublishError extends Data.TaggedError('IdentityPublishError')<{
  readonly did: string;
  readonly message: string;
}> {}

export class IdentityNotFoundError extends Data.TaggedError('IdentityNotFoundError')<{
  readonly did: string;
  readonly message: string;
}> {}

export class DuplicateIdentityError extends Data.TaggedError('DuplicateIdentityError')<{
  readonly did: string;
  readonly message: string;
}> {}

export type EnboxEffectError =
  | EnboxSdkError
  | EnboxStorageError
  | DwnRegistrationError
  | ProtocolInstallationError
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
