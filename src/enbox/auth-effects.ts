import { Effect } from 'effect';
import { AuthManager } from '@enbox/auth';

import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { DwnRegistrationError, sdkError } from './effect/errors';
import { runEnboxPromise } from './effect/runtime';
import { IDENTITY_SYNC_PROTOCOLS } from './protocols';
import { getStoredTokens, storeTokens } from './registration';

export type WalletAuthManager = Awaited<ReturnType<typeof AuthManager.create>>;
export type WalletSession = Awaited<ReturnType<WalletAuthManager['restoreSession']>>;

export interface ProviderAuthRequest {
  authorizeUrl: string;
  state: string;
}

export function resolveProviderAuthEffect(request: ProviderAuthRequest) {
  return Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: async () => fetch(request.authorizeUrl, { signal: AbortSignal.timeout(30_000) }),
      catch: sdkError('providerAuth.fetch'),
    });

    if (!res.ok) {
      const responseText = yield* Effect.tryPromise({
        try: async () => res.text(),
        catch: sdkError('providerAuth.errorText'),
      });
      return yield* Effect.fail(
        new DwnRegistrationError({
          operation: 'providerAuth.fetch',
          cause: res,
          message: `Provider auth failed (${res.status}): ${responseText}`,
        }),
      );
    }

    const { code, state: returnedState } = yield* Effect.tryPromise({
      try: async () => res.json() as Promise<{ code: string; state: string }>,
      catch: sdkError('providerAuth.response.json'),
    });

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
        dwnEndpoints: DEFAULT_DWN_ENDPOINTS,
        identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
        registration: {
          onSuccess: () => {},
          onFailure: (err: unknown) =>
            console.warn('EnboxAuthProvider: DWN registration failed:', err),
          onProviderAuthRequired: (request: ProviderAuthRequest) =>
            runEnboxPromise(resolveProviderAuthEffect(request)),
          registrationTokens: getStoredTokens(),
          onRegistrationTokens: storeTokens,
        },
      } as Parameters<typeof AuthManager.create>[0]),
    catch: sdkError('authManager.create'),
  });
}

export function connectVaultEffect(
  auth: WalletAuthManager,
  password: string,
  dwnEndpoints?: string[],
) {
  return Effect.tryPromise({
    try: () =>
      auth.connectVault({
        password,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
        identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
      } as Parameters<WalletAuthManager['connectVault']>[0]),
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
    try: () =>
      auth.restoreFromPhrase({
        password,
        recoveryPhrase,
        dwnEndpoints: dwnEndpoints ?? DEFAULT_DWN_ENDPOINTS,
        identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
      } as Parameters<WalletAuthManager['restoreFromPhrase']>[0]),
    catch: sdkError('authManager.restoreFromPhrase'),
  });
}

export function lockAuthManagerEffect(auth: WalletAuthManager) {
  return Effect.tryPromise({
    try: () => auth.lock(),
    catch: sdkError('authManager.lock'),
  });
}
