import type { ProviderAuthParams } from '@enbox/browser';

import { Effect } from 'effect';
import { AuthManager } from '@enbox/browser';

import { normalizeDwnEndpoints } from '@/lib/dwn-endpoints';
import { withPromiseTimeout } from '@/lib/promise-timeout';
import { DwnRegistrationError, sdkError } from './effect/errors';
import { fetchWithEffectSignal, withNetworkPolicy } from './effect/network-policy';
import { runEnboxPromise } from './effect/runtime';
import { IDENTITY_SYNC_MODULES } from './modules';
import type { WalletRestoreOptions } from './types';

export type WalletAuthManager = Awaited<ReturnType<typeof AuthManager.create>>;

export const AUTH_CREATE_TIMEOUT_MS = 20_000;
export const AUTH_RESTORE_SESSION_TIMEOUT_MS = 20_000;
export const AUTH_LOCK_TIMEOUT_MS = 10_000;

function sdkTimeout(operation: string) {
  return sdkError(operation)(new Error(`${operation} timed out`));
}

export function resolveProviderAuthEffect(request: ProviderAuthParams) {
  return Effect.gen(function* () {
    const { code, state: returnedState } = yield* withNetworkPolicy(
      'providerAuth.fetch',
      Effect.tryPromise({
        try: async (signal) => {
          const res = await fetchWithEffectSignal(signal, request.authorizeUrl);
          if (!res.ok) {
            throw new Error(`Provider auth failed (${res.status}): ${await res.text()}`);
          }
          return res.json() as Promise<{ code: string; state: string }>;
        },
        catch: sdkError('providerAuth.fetch'),
      }),
      () => sdkTimeout('providerAuth.fetch'),
    );

    if (returnedState !== request.state) {
      return yield* Effect.fail(
        new DwnRegistrationError({
          operation: 'providerAuth.state',
          cause: { expected: request.state, actual: returnedState },
          message: 'Provider auth state mismatch - possible CSRF',
        }),
      );
    }

    return { code, state: returnedState };
  });
}

export function createWalletAuthManagerEffect(
  onOrphanedAuth?: (auth: WalletAuthManager) => void,
) {
  return Effect.tryPromise({
    try: () => {
      let timedOut = false;
      const createPromise = AuthManager.create({
        identitySyncModules: IDENTITY_SYNC_MODULES,
        // AuthManager owns background sync startup and session-bound cleanup.
        sync: 'live',
        registration: {
          onProviderAuthRequired: (request: ProviderAuthParams) =>
            runEnboxPromise(resolveProviderAuthEffect(request)),
          persistTokens: true,
        },
      });
      return withPromiseTimeout(
        () => createPromise,
        AUTH_CREATE_TIMEOUT_MS,
        () => {
          timedOut = true;
          return new Error('Wallet initialization timed out. Close other wallet tabs or try again.');
        },
      ).catch((err: unknown) => {
        if (timedOut) {
          // If AuthManager.create() eventually settles after the deadline,
          // shut down the orphaned instance so IndexedDB/sync handles don't leak.
          void createPromise.then(
            (lateAuth) => {
              if (onOrphanedAuth) {
                void Promise.resolve().then(() => onOrphanedAuth(lateAuth)).catch(() => {});
              } else {
                void lateAuth.shutdown().catch(() => {});
              }
            },
            () => {},
          );
        }
        throw err;
      });
    },
    catch: sdkError('authManager.create'),
  });
}

export function connectVaultEffect(
  auth: WalletAuthManager,
  password: string,
  dwnEndpoints: string[],
) {
  return Effect.tryPromise({
    try: () =>
      auth.connectVault({
        password,
        dwnEndpoints: normalizeDwnEndpoints(dwnEndpoints),
      }),
    catch: sdkError('authManager.connectVault'),
  });
}

export function restoreSessionEffect(auth: WalletAuthManager, password: string, signal?: AbortSignal) {
  return Effect.tryPromise({
    try: async () => {
      const session = await withPromiseTimeout(
        () => auth.restoreSession({ password }),
        AUTH_RESTORE_SESSION_TIMEOUT_MS,
        () => new Error(
          'Unlocking timed out while restoring your session. Close other wallet tabs and try again.',
        ),
        signal,
      );
      signal?.throwIfAborted();
      return session;
    },
    catch: sdkError('authManager.restoreSession'),
  });
}

export function restoreFromPhraseEffect(
  auth: WalletAuthManager,
  recoveryPhrase: string,
  password: string,
  options: WalletRestoreOptions = {},
) {
  return Effect.tryPromise({
    try: () => auth.restoreFromPhrase({
      password,
      recoveryPhrase,
      ...(options.dwnEndpoints === undefined
        ? {}
        : { dwnEndpoints: normalizeDwnEndpoints(options.dwnEndpoints) }),
      ...(options.onVaultPasswordCommitted === undefined
        ? {}
        : { onVaultPasswordCommitted: options.onVaultPasswordCommitted }),
    }),
    catch: sdkError('authManager.restoreFromPhrase'),
  });
}

export function lockAuthManagerEffect(auth: WalletAuthManager) {
  return Effect.tryPromise({
    try: () =>
      withPromiseTimeout(
        () => auth.lock(),
        AUTH_LOCK_TIMEOUT_MS,
        () => new Error('Locking the wallet timed out.'),
      ),
    catch: sdkError('authManager.lock'),
  });
}
