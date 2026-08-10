import { Effect, Schedule } from 'effect';
import { AuthManager } from '@enbox/auth';

import { STORAGE_KEYS } from '@/lib/constants';
import { getConfiguredDwnEndpoints, normalizeDwnEndpoints } from '@/lib/dwn-endpoints';
import { localStorageGetEffect } from '@/lib/browser-effects';
import { DwnRegistrationError, sdkError } from './effect/errors';
import { withNetworkPolicy } from './effect/network-policy';
import { runEnboxPromise } from './effect/runtime';
import { IDENTITY_SYNC_PROTOCOLS } from './protocols';

export type WalletAuthManager = Awaited<ReturnType<typeof AuthManager.create>>;
export type WalletSession = Awaited<ReturnType<WalletAuthManager['restoreSession']>>;

export interface ProviderAuthRequest {
  authorizeUrl: string;
  state: string;
}

function sdkTimeout(operation: string) {
  return sdkError(operation)(new Error(`${operation} timed out`));
}

export function resolveProviderAuthEffect(request: ProviderAuthRequest) {
  return Effect.gen(function* () {
    const res = yield* withNetworkPolicy(
      'providerAuth.fetch',
      Effect.tryPromise({
        try: async () => fetch(request.authorizeUrl, { signal: AbortSignal.timeout(30_000) }),
        catch: sdkError('providerAuth.fetch'),
      }),
      () => sdkTimeout('providerAuth.fetch'),
    );

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
        dwnEndpoints: getConfiguredDwnEndpoints(),
        identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
        // Live subscriptions are the primary transport. Leave the interval
        // unset so the SDK's default settle check remains the recovery net.
        sync: 'live',
        registration: {
          onSuccess: () => {},
          onFailure: (err: unknown) =>
            console.warn('EnboxAuthProvider: DWN registration failed:', err),
          onProviderAuthRequired: (request: ProviderAuthRequest) =>
            runEnboxPromise(resolveProviderAuthEffect(request)),
          persistTokens: true,
        },
      } as Parameters<typeof AuthManager.create>[0]),
    catch: sdkError('authManager.create'),
  });
}

// ── Local DWN discovery (DORMANT — pending migration) ──────────────
//
// @enbox/auth 0.6.61 removed `requestLocalDwnDiscovery` (the `dwn://connect`
// auto-redirect discovery) in favor of an explicit, user-gesture localhost
// pairing model: `probeLocalDwn`, `initiateLocalDwnPairing`,
// `requestLocalDwnPairing`, `discoverLocalDwnPairing`. Existing pairings are
// restored automatically by the AuthManager on boot.
//
// The discovery effects below are kept intact but DORMANT (gated behind
// `LOCAL_DWN_DISCOVERY_ENABLED` in provider.tsx) so the in-progress local-DWN
// pairing work can resume from here. To revive: replace this placeholder with
// the pairing primitives above, wired to a user gesture in the provider.
function requestLocalDwnDiscovery(): void {
  throw new Error(
    'requestLocalDwnDiscovery was removed in @enbox/auth 0.6.61; migrate to the ' +
      'localhost-pairing API (probeLocalDwn / initiateLocalDwnPairing / requestLocalDwnPairing).',
  );
}

export function requestLocalDwnDiscoveryEffect() {
  return Effect.try({
    try: () => requestLocalDwnDiscovery(),
    catch: sdkError('auth.requestLocalDwnDiscovery'),
  });
}

export function requestLocalDwnDiscoveryUntilEndpointEffect(
  timeoutMs: number,
  intervalMs = 250,
) {
  const retries = Math.max(1, Math.ceil(timeoutMs / intervalMs));

  return Effect.gen(function* () {
    yield* requestLocalDwnDiscoveryEffect();

    return yield* localStorageGetEffect(STORAGE_KEYS.LOCAL_DWN_ENDPOINT).pipe(
      Effect.flatMap((endpoint) =>
        endpoint
          ? Effect.succeed(endpoint)
          : Effect.fail(sdkError('auth.localDwnDiscovery.poll')(new Error('Local DWN endpoint not found yet')))
      ),
      Effect.retry(Schedule.intersect(
        Schedule.spaced(`${intervalMs} millis`),
        Schedule.recurs(retries),
      )),
      Effect.catchAll(() => Effect.succeed(null)),
    );
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
        dwnEndpoints: normalizeDwnEndpoints(dwnEndpoints ?? getConfiguredDwnEndpoints()),
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
    try: () => auth.restoreFromPhrase({
      password,
      recoveryPhrase,
      identitySyncProtocols: IDENTITY_SYNC_PROTOCOLS,
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
