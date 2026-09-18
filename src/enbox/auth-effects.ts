import type { ProviderAuthParams } from '@enbox/browser';

import { Effect } from 'effect';
import { AuthManager } from '@enbox/browser';

import { normalizeDwnEndpoints } from '@/lib/dwn-endpoints';
import { DwnRegistrationError, sdkError } from './effect/errors';
import { fetchWithEffectSignal, withNetworkPolicy } from './effect/network-policy';
import { runEnboxPromise } from './effect/runtime';
import { IDENTITY_SYNC_PROTOCOLS } from './protocols';

export type WalletAuthManager = Awaited<ReturnType<typeof AuthManager.create>>;

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

export function createWalletAuthManagerEffect() {
  return Effect.tryPromise({
    try: () =>
      AuthManager.create({
        identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
        // AuthManager owns background sync startup and session-bound cleanup.
        sync: 'live',
        registration: {
          onSuccess: () => {},
          onFailure: (err: unknown) =>
            console.warn('EnboxAuthProvider: DWN registration failed:', err),
          onProviderAuthRequired: (request: ProviderAuthParams) =>
            runEnboxPromise(resolveProviderAuthEffect(request)),
          persistTokens: true,
        },
      }),
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

export function restoreSessionEffect(auth: WalletAuthManager, password: string) {
  return Effect.tryPromise({
    try: () => auth.restoreSession({ password }),
    catch: sdkError('authManager.restoreSession'),
  });
}

export function restoreFromPhraseEffect(
  auth: WalletAuthManager,
  recoveryPhrase: string,
  password: string,
  dwnEndpoints?: string[],
) {
  return Effect.tryPromise({
    try: () => auth.restoreFromPhrase({
      password,
      recoveryPhrase,
      ...(dwnEndpoints === undefined
        ? {}
        : { dwnEndpoints: normalizeDwnEndpoints(dwnEndpoints) }),
    }),
    catch: sdkError('authManager.restoreFromPhrase'),
  });
}

export function lockAuthManagerEffect(auth: WalletAuthManager) {
  return Effect.tryPromise({
    try: () => auth.lock(),
    catch: sdkError('authManager.lock'),
  });
}
