/**
 * DWN tenant registration logic.
 *
 * After a session is restored the agent DID and every identity DID must be
 * registered as tenants on the configured remote DWN endpoints.
 * AuthManager.connectVault() handles this for first-time setup, but
 * restoreSession() does NOT — so we run it manually after every unlock.
 *
 * Supports the provider-auth-v0 flow (authorize → token exchange) and
 * falls back to proof-of-work registration.
 */

import { Effect } from 'effect';
import { DwnRegistrar } from '@enbox/dwn-clients';
import type { ServerInfo } from '@enbox/dwn-clients';

import { STORAGE_KEYS } from '@/lib/constants';
import type { EnboxAgent, RegistrationTokenData } from './types';
import {
  CurrentAgent,
  RegistrationTokenStore,
  enboxLiveLayer,
} from './effect/services';
import {
  DwnRegistrationError,
  registrationError,
  sdkError,
} from './effect/errors';
import { runEnboxPromise } from './effect/runtime';

// ── Token persistence ──────────────────────────────────────────────

export function getStoredTokens(): Record<string, RegistrationTokenData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.REGISTRATION_TOKENS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function storeTokens(tokens: Record<string, RegistrationTokenData>): void {
  localStorage.setItem(STORAGE_KEYS.REGISTRATION_TOKENS, JSON.stringify(tokens));
}

function isTokenExpired(token: RegistrationTokenData): boolean {
  if (!token.expiresAt) return false;
  return Date.now() >= token.expiresAt - 60_000;
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

    const authResponse = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(authorizeUrl, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) {
          throw new Error(`Provider auth authorize failed (${res.status}): ${await res.text()}`);
        }
        return res.json() as Promise<{ code: string; state: string }>;
      },
      catch: registrationError('providerAuth.authorize', dwnEndpoint),
    });

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

    const tokenResponse = yield* Effect.tryPromise({
      try: () =>
        DwnRegistrar.exchangeAuthCode(
          providerAuth.tokenUrl,
          authResponse.code,
          dwnEndpoint,
        ),
      catch: registrationError('providerAuth.exchangeCode', dwnEndpoint),
    });

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
        const refreshed = yield* Effect.tryPromise({
          try: () =>
            DwnRegistrar.refreshRegistrationToken(
              tokenData.refreshUrl!,
              tokenData.refreshToken!,
            ),
          catch: registrationError('providerAuth.refreshToken', dwnEndpoint),
        });
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
    let updated = { ...tokens };
    const requiresProviderAuth =
      serverInfo.registrationRequirements?.includes('provider-auth-v0') &&
      serverInfo.providerAuth !== undefined;

    if (requiresProviderAuth) {
      updated = yield* ensureValidTokenEffect(dwnEndpoint, serverInfo.providerAuth!, updated);
      yield* Effect.tryPromise({
        try: () =>
          DwnRegistrar.registerTenantWithToken(
            dwnEndpoint,
            did,
            updated[dwnEndpoint].registrationToken,
          ),
        catch: registrationError('tenant.registerWithToken', dwnEndpoint, did),
      });
    } else {
      yield* Effect.tryPromise({
        try: () => DwnRegistrar.registerTenant(dwnEndpoint, did),
        catch: registrationError('tenant.register', dwnEndpoint, did),
      });
    }

    return updated;
  });
}

/**
 * Ensure all agent and identity DIDs are registered as tenants on every
 * configured DWN endpoint.
 */
export async function ensureRegistration(
  agent: EnboxAgent,
  dwnEndpoints: string[],
): Promise<void> {
  await runEnboxPromise(
    ensureRegistrationEffect(dwnEndpoints).pipe(
      Effect.provide(enboxLiveLayer(agent)),
    ),
  );
}

export function ensureRegistrationEffect(dwnEndpoints: string[]) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const tokenStore = yield* RegistrationTokenStore;

    const agentDid: string = agent.agentDid.uri;
    const identities = yield* Effect.tryPromise({
      try: async (): Promise<any[]> => agent.identity.list(),
      catch: sdkError('identity.list'),
    });

    const didsToRegister = new Set<string>([agentDid]);
    for (const identity of identities) {
      didsToRegister.add(identity.metadata.connectedDid ?? identity.did.uri);
    }

    let tokens = yield* tokenStore.get;

    for (const endpoint of dwnEndpoints) {
      const serverInfo = yield* Effect.tryPromise({
        try: async (): Promise<ServerInfo> => agent.rpc.getServerInfo(endpoint),
        catch: registrationError('serverInfo.get', endpoint),
      }).pipe(
        Effect.catchAll((err) =>
          Effect.sync(() => {
            console.warn(`Could not reach DWN endpoint ${endpoint} for registration:`, err);
            return undefined;
          })
        ),
      );

      if (!serverInfo) continue;

      for (const did of didsToRegister) {
        tokens = yield* registerDidWithEndpointEffect(endpoint, did, serverInfo, tokens).pipe(
          Effect.catchAll((err) =>
            Effect.sync(() => {
              console.warn(`DWN registration of ${did} with ${endpoint} failed:`, err);
              return tokens;
            })
          ),
        );
      }
    }

    yield* tokenStore.set(tokens);
  });
}
