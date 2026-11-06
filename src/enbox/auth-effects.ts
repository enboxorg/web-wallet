import type { ProviderAuthParams } from '@enbox/browser';

import { Effect } from 'effect';
import { AuthManager } from '@enbox/browser';

import { normalizeDwnEndpoints } from '@/lib/dwn-endpoints';
import { DwnRegistrationError, sdkError } from './effect/errors';
import { fetchWithEffectSignal, withNetworkPolicy } from './effect/network-policy';
import { runEnboxPromise } from './effect/runtime';
import { IDENTITY_SYNC_MODULES } from './modules';
import type { WalletRestoreOptions } from './types';

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
        identitySyncModules: IDENTITY_SYNC_MODULES,
        // AuthManager owns background sync startup and session-bound cleanup.
        sync: 'live',
        registration: {
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

/** Reopen a completed owner vault after SDK session-record upgrades, without restoring delegated sessions. */
async function reopenOwnerVault(auth: WalletAuthManager, password: string, signal?: AbortSignal) {
  let headless: Awaited<ReturnType<WalletAuthManager['connectHeadless']>> | undefined;
  let emptyInventoryError: Error | undefined;
  signal?.throwIfAborted();
  try {
    // This checks the password and opens the existing vault without sync,
    // registration, or a persisted session. Inspect ownership before reconnecting.
    headless = await auth.connectHeadless({ password });
  } catch (error) {
    signal?.throwIfAborted();
    // The pinned SDK has no headless result for a completed agent-only wallet.
    // Accept only this specific outcome after a successful vault unlock, and
    // confirm the inventory is still empty below; never swallow other failures.
    if (!(error instanceof Error) || error.message !== '[@enbox/auth] No identities found in vault.' || auth.isLocked) {
      throw error;
    }
    emptyInventoryError = error;
  }

  const assertActive = () => {
    signal?.throwIfAborted();
    headless?.signal.throwIfAborted();
    if (auth.isLocked) throw new Error('Wallet was locked before owner reconnection completed.');
  };
  assertActive();
  const identities = await auth.agent.identity.list();
  assertActive();
  const pendingSetup = await auth.vault.getPendingSetup();
  assertActive();

  let refusal: Error | undefined;
  if (emptyInventoryError !== undefined && identities.length !== 0) {
    refusal = emptyInventoryError;
  } else if (identities.some((identity) => identity.metadata.connectedDid !== undefined)) {
    refusal = new Error('Wallet unlock cannot reopen delegated identity credentials as an owner session.');
  } else if (pendingSetup !== undefined || auth.agent.agentDid.metadata.published === false) {
    refusal = new Error('Wallet setup is incomplete. Complete setup or recovery before unlocking.');
  }
  if (refusal !== undefined) {
    await auth.lock();
    signal?.throwIfAborted();
    throw refusal;
  }

  const session = await auth.connectVault({ password, createIdentity: false });
  signal?.throwIfAborted();
  return session;
}

export function restoreSessionEffect(auth: WalletAuthManager, password: string, signal?: AbortSignal) {
  return Effect.tryPromise({
    try: async () => {
      signal?.throwIfAborted();
      const session = await auth.restoreSession({ password });
      signal?.throwIfAborted();
      // A restore that unlocked before declining may have completed teardown or
      // rejected a stale binding. Preserve that result instead of reconnecting.
      if (session !== undefined || !auth.isLocked) return session;
      const initialized = await auth.vault.isInitialized();
      signal?.throwIfAborted();
      if (!initialized) return undefined;
      return reopenOwnerVault(auth, password, signal);
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
    try: () => auth.lock(),
    catch: sdkError('authManager.lock'),
  });
}
