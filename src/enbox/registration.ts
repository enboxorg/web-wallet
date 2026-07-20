/**
 * DWN tenant registration logic.
 *
 * Registration is a topology lifecycle operation: it runs when a DID is first
 * created, when a new endpoint is added, or when sync confirms that a remote
 * lost the tenant registration. Session restore and identity import preserve
 * existing remote ownership and must not register implicitly.
 *
 * Supports the provider-auth-v0 flow (authorize → token exchange) and
 * falls back to proof-of-work registration.
 */

import { Effect } from 'effect';
import { DwnRegistrar } from '@enbox/dwn-clients';
import type { ServerInfo } from '@enbox/dwn-clients';

import type { EnboxAgent, RegistrationTokenData } from './types';
import {
  CurrentAgent,
  RegistrationTokenStore,
  enboxLiveLayer,
} from './effect/services';
import {
  DwnRegistrationError,
  registrationError,
} from './effect/errors';
import { withNetworkPolicy } from './effect/network-policy';
import { runEnboxPromise } from './effect/runtime';
import { runRegistrationSingleFlight } from './effect/keyed-single-flight';

function isTokenExpired(token: RegistrationTokenData): boolean {
  if (!token.expiresAt) return false;
  return Date.now() >= token.expiresAt - 60_000;
}

function registrationTimeout(operation: string, endpoint?: string, did?: string) {
  return registrationError(operation, endpoint, did)(new Error(`${operation} timed out`));
}

// ── Provider-auth flow ─────────────────────────────────────────────

function obtainProviderAuthTokenEffect(
  dwnEndpoint: string,
  providerAuth: NonNullable<ServerInfo['providerAuth']>,
) {
  return Effect.gen(function* () {
    const state = yield* Effect.sync(() => crypto.randomUUID());
    const separator = providerAuth.authorizeUrl.includes('?') ? '&' : '?';
    const authorizeUrl =
      `${providerAuth.authorizeUrl}${separator}` +
      `redirect_uri=${encodeURIComponent(dwnEndpoint)}` +
      `&state=${encodeURIComponent(state)}`;

    const authResponse = yield* withNetworkPolicy(
      'providerAuth.authorize',
      Effect.tryPromise({
        try: async () => {
          const res = await fetch(authorizeUrl, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) {
            throw new Error(`Provider auth authorize failed (${res.status}): ${await res.text()}`);
          }
          return res.json() as Promise<{ code: string; state: string }>;
        },
        catch: registrationError('providerAuth.authorize', dwnEndpoint),
      }),
      () => registrationTimeout('providerAuth.authorize', dwnEndpoint),
    );

    if (authResponse.state !== state) {
      return yield* Effect.fail(
        new DwnRegistrationError({
          operation: 'providerAuth.authorize',
          endpoint: dwnEndpoint,
          cause: authResponse,
          message: 'Provider auth state mismatch - possible CSRF',
        }),
      );
    }

    const tokenResponse = yield* withNetworkPolicy(
      'providerAuth.exchangeCode',
      Effect.tryPromise({
        try: () =>
          DwnRegistrar.exchangeAuthCode(
            providerAuth.tokenUrl,
            authResponse.code,
            dwnEndpoint,
          ),
        catch: registrationError('providerAuth.exchangeCode', dwnEndpoint),
      }),
      () => registrationTimeout('providerAuth.exchangeCode', dwnEndpoint),
    );

    return {
      registrationToken: tokenResponse.registrationToken,
      refreshToken: tokenResponse.refreshToken,
      expiresAt: tokenResponse.expiresIn != null
        ? Date.now() + tokenResponse.expiresIn * 1000
        : undefined,
      tokenUrl: providerAuth.tokenUrl,
      refreshUrl: providerAuth.refreshUrl,
    } satisfies RegistrationTokenData;
  });
}

function ensureValidTokenEffect(
  dwnEndpoint: string,
  providerAuth: NonNullable<ServerInfo['providerAuth']>,
  tokens: Record<string, RegistrationTokenData>,
) {
  return Effect.gen(function* () {
    let tokenData = tokens[dwnEndpoint];

    if (tokenData) {
      if (isTokenExpired(tokenData) && tokenData.refreshUrl && tokenData.refreshToken) {
        const refreshed = yield* withNetworkPolicy(
          'providerAuth.refreshToken',
          Effect.tryPromise({
            try: () =>
              DwnRegistrar.refreshRegistrationToken(
                tokenData.refreshUrl!,
                tokenData.refreshToken!,
              ),
            catch: registrationError('providerAuth.refreshToken', dwnEndpoint),
          }),
          () => registrationTimeout('providerAuth.refreshToken', dwnEndpoint),
        );
        tokenData = {
          ...tokenData,
          registrationToken: refreshed.registrationToken,
          refreshToken: refreshed.refreshToken ?? tokenData.refreshToken,
          expiresAt: refreshed.expiresIn
            ? Date.now() + refreshed.expiresIn * 1000
            : tokenData.expiresAt,
        };
      } else if (isTokenExpired(tokenData)) {
        tokenData = yield* obtainProviderAuthTokenEffect(dwnEndpoint, providerAuth);
      }
    } else {
      tokenData = yield* obtainProviderAuthTokenEffect(dwnEndpoint, providerAuth);
    }

    return {
      ...tokens,
      [dwnEndpoint]: tokenData,
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────

function registerDidWithEndpointEffect(
  dwnEndpoint: string,
  did: string,
  serverInfo: ServerInfo,
  tokens: Record<string, RegistrationTokenData>,
) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    let updated = { ...tokens };
    if (serverInfo.registrationRequirements.length === 0) {
      return updated;
    }

    const requiresProviderAuth =
      serverInfo.registrationRequirements?.includes('provider-auth-v0') &&
      serverInfo.providerAuth !== undefined;

    if (requiresProviderAuth) {
      updated = yield* ensureValidTokenEffect(dwnEndpoint, serverInfo.providerAuth!, updated);
      yield* withNetworkPolicy(
        'tenant.registerWithToken',
        Effect.tryPromise({
          try: () =>
            runRegistrationSingleFlight(
              agent,
              did,
              dwnEndpoint,
              () => DwnRegistrar.registerTenantWithToken(
                dwnEndpoint,
                did,
                updated[dwnEndpoint].registrationToken,
              ),
            ),
          catch: registrationError('tenant.registerWithToken', dwnEndpoint, did),
        }),
        () => registrationTimeout('tenant.registerWithToken', dwnEndpoint, did),
      );
    } else {
      yield* withNetworkPolicy(
        'tenant.register',
        Effect.tryPromise({
          try: () => runRegistrationSingleFlight(
            agent,
            did,
            dwnEndpoint,
            () => DwnRegistrar.registerTenant(dwnEndpoint, did),
          ),
          catch: registrationError('tenant.register', dwnEndpoint, did),
        }),
        () => registrationTimeout('tenant.register', dwnEndpoint, did),
      );
    }

    return updated;
  });
}

/** Register every specified owner DID at every request-supplied endpoint. */
export async function ensureRegistrationForDids(
  agent: EnboxAgent,
  dwnEndpoints: string[],
  dids: string[],
): Promise<void> {
  await runEnboxPromise(
    ensureRegistrationEffect(dwnEndpoints, dids).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function ensureRegistrationEffect(dwnEndpoints: string[], dids: string[]) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const tokenStore = yield* RegistrationTokenStore;

    const didsToRegister = new Set(dids);
    const endpointsToRegister = new Set(dwnEndpoints);
    const failures: unknown[] = [];
    const failedRegistrations: Array<{ did: string; endpoint: string }> = [];
    let successfulRegistrations = 0;

    if (didsToRegister.size > 0 && endpointsToRegister.size === 0) {
      return yield* Effect.fail(
        new DwnRegistrationError({
          operation: 'tenant.register',
          cause: { dids: [...didsToRegister] },
          message: 'Unable to register DIDs without a configured DWN endpoint.',
        }),
      );
    }

    let tokens = yield* tokenStore.get;

    for (const endpoint of endpointsToRegister) {
      const serverInfo = yield* withNetworkPolicy(
        'serverInfo.get',
        Effect.tryPromise({
          try: async (): Promise<ServerInfo> => agent.rpc.getServerInfo(endpoint),
          catch: registrationError('serverInfo.get', endpoint),
        }),
        () => registrationTimeout('serverInfo.get', endpoint),
      ).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => {
            console.warn(`Could not reach DWN endpoint ${endpoint} for registration:`, err);
            failures.push(err);
            for (const did of didsToRegister) {
              failedRegistrations.push({ did, endpoint });
            }
            return undefined;
          })
        ),
      );

      if (!serverInfo) continue;

      for (const did of didsToRegister) {
        const registration = yield* registerDidWithEndpointEffect(endpoint, did, serverInfo, tokens).pipe(
          Effect.map((updatedTokens) => ({ updatedTokens, succeeded: true as const })),
          Effect.catchAll((err) =>
            Effect.sync(() => {
              console.warn(`DWN registration of ${did} with ${endpoint} failed:`, err);
              failures.push(err);
              failedRegistrations.push({ did, endpoint });
              return { updatedTokens: tokens, succeeded: false as const };
            })
          ),
        );
        tokens = registration.updatedTokens;
        if (registration.succeeded) {
          successfulRegistrations += 1;
        }
      }
    }

    yield* tokenStore.set(tokens);
    if (failedRegistrations.length > 0) {
      const failedPairs = failedRegistrations
        .map(({ did, endpoint }) => `${did} with ${endpoint}`)
        .join(', ');
      return yield* Effect.fail(
        new DwnRegistrationError({
          operation: 'tenant.register',
          cause: { failedRegistrations, failures },
          message: `Unable to register every requested tenant; failed: ${failedPairs}.`,
        }),
      );
    }

    return {
      failed: 0,
      succeeded: successfulRegistrations,
    };
  });
}
