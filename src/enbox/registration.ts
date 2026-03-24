/**
 * DWN tenant registration logic.
 *
 * After a session is restored the agent DID and every identity DID must be
 * registered as tenants on the configured remote DWN endpoints.
 * AuthManager.connect() handles this for first-time setup, but
 * restoreSession() does NOT — so we run it manually after every unlock.
 *
 * Supports the provider-auth-v0 flow (authorize → token exchange) and
 * falls back to proof-of-work registration.
 */

import { DwnRegistrar } from '@enbox/dwn-clients';
import type { ServerInfo } from '@enbox/dwn-clients';

import { STORAGE_KEYS } from '@/lib/constants';
import type { EnboxAgent, RegistrationTokenData } from './types';

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

async function obtainProviderAuthToken(
  dwnEndpoint: string,
  providerAuth: NonNullable<ServerInfo['providerAuth']>,
): Promise<RegistrationTokenData> {
  const state = crypto.randomUUID();
  const separator = providerAuth.authorizeUrl.includes('?') ? '&' : '?';
  const authorizeUrl =
    `${providerAuth.authorizeUrl}${separator}` +
    `redirect_uri=${encodeURIComponent(dwnEndpoint)}` +
    `&state=${encodeURIComponent(state)}`;

  const res = await fetch(authorizeUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`Provider auth authorize failed (${res.status}): ${await res.text()}`);
  }

  const { code, state: returnedState } = (await res.json()) as { code: string; state: string };
  if (returnedState !== state) {
    throw new Error('Provider auth state mismatch — possible CSRF');
  }

  const tokenResponse = await DwnRegistrar.exchangeAuthCode(
    providerAuth.tokenUrl,
    code,
    dwnEndpoint,
  );

  return {
    registrationToken: tokenResponse.registrationToken,
    refreshToken: tokenResponse.refreshToken,
    expiresAt: tokenResponse.expiresIn != null
      ? Date.now() + tokenResponse.expiresIn * 1000
      : undefined,
    tokenUrl: providerAuth.tokenUrl,
    refreshUrl: providerAuth.refreshUrl,
  };
}

async function ensureValidToken(
  dwnEndpoint: string,
  providerAuth: NonNullable<ServerInfo['providerAuth']>,
  tokens: Record<string, RegistrationTokenData>,
): Promise<RegistrationTokenData> {
  let tokenData = tokens[dwnEndpoint];

  if (tokenData) {
    if (isTokenExpired(tokenData) && tokenData.refreshUrl && tokenData.refreshToken) {
      const refreshed = await DwnRegistrar.refreshRegistrationToken(
        tokenData.refreshUrl,
        tokenData.refreshToken,
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
      tokenData = await obtainProviderAuthToken(dwnEndpoint, providerAuth);
    }
  } else {
    tokenData = await obtainProviderAuthToken(dwnEndpoint, providerAuth);
  }

  tokens[dwnEndpoint] = tokenData;
  return tokenData;
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Register a single DID with a single DWN endpoint.
 * Returns the (possibly updated) tokens map.
 */
async function registerDidWithEndpoint(
  dwnEndpoint: string,
  did: string,
  serverInfo: ServerInfo,
  tokens: Record<string, RegistrationTokenData>,
): Promise<Record<string, RegistrationTokenData>> {
  const updated = { ...tokens };
  const requiresProviderAuth =
    serverInfo.registrationRequirements?.includes('provider-auth-v0') &&
    serverInfo.providerAuth !== undefined;

  if (requiresProviderAuth) {
    const tokenData = await ensureValidToken(dwnEndpoint, serverInfo.providerAuth!, updated);
    await DwnRegistrar.registerTenantWithToken(dwnEndpoint, did, tokenData.registrationToken);
  } else {
    await DwnRegistrar.registerTenant(dwnEndpoint, did);
  }

  return updated;
}

/**
 * Ensure all agent and identity DIDs are registered as tenants on every
 * configured DWN endpoint.
 */
export async function ensureRegistration(
  agent: EnboxAgent,
  dwnEndpoints: string[],
): Promise<void> {
  const agentDid: string = agent.agentDid.uri;
  const identities = await agent.identity.list();

  const didsToRegister = new Set<string>([agentDid]);
  for (const identity of identities) {
    didsToRegister.add(identity.metadata.connectedDid ?? identity.did.uri);
  }

  let tokens = getStoredTokens();

  for (const endpoint of dwnEndpoints) {
    try {
      const serverInfo = await agent.rpc.getServerInfo(endpoint);
      for (const did of didsToRegister) {
        try {
          tokens = await registerDidWithEndpoint(endpoint, did, serverInfo, tokens);
        } catch (err) {
          console.warn(`DWN registration of ${did} with ${endpoint} failed:`, err);
        }
      }
    } catch (err) {
      console.warn(`Could not reach DWN endpoint ${endpoint} for registration:`, err);
    }
  }

  storeTokens(tokens);
}
