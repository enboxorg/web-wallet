/**
 * Provider-auth registration token management.
 *
 * Persists `RegistrationTokenData` (keyed by DWN endpoint URL) in localStorage
 * so that tokens survive page reloads and can be passed back into
 * `Web5.connect()` or used directly with `DwnRegistrar` on subsequent sessions.
 *
 * When a DWN endpoint requires `provider-auth-v0` and no cached token exists,
 * the authorize → token-exchange flow is performed automatically.
 *
 * @module
 */

import { DwnRegistrar, ServerInfo } from '@enbox/dwn-clients';

const STORAGE_KEY = 'enbox:registrationTokens';

/**
 * Shape of a persisted registration token for a single DWN endpoint.
 * Matches the `RegistrationTokenData` type from `@enbox/api`.
 */
export type RegistrationTokenData = {
  registrationToken : string;
  refreshToken?     : string;
  expiresAt?        : number;   // Unix timestamp (ms); undefined = never expires
  tokenUrl          : string;
  refreshUrl?       : string;
};

/** Retrieve all stored registration tokens (keyed by DWN endpoint URL). */
export function getStoredTokens(): Record<string, RegistrationTokenData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Persist registration tokens to localStorage. */
export function storeTokens(tokens: Record<string, RegistrationTokenData>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
}

/** Remove all stored registration tokens. */
export function clearTokens(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Check whether a token is expired (with 60s buffer). */
export function isTokenExpired(token: RegistrationTokenData): boolean {
  if (!token.expiresAt) { return false; } // never expires
  return Date.now() >= token.expiresAt - 60_000;
}

/**
 * Obtain a fresh provider-auth registration token by performing the
 * authorize → token-exchange flow against the DWN server.
 *
 * The server's `/provider-auth/authorize` endpoint auto-approves and returns
 * JSON with the authorization code.  That code is then exchanged at the
 * `/provider-auth/token` endpoint for a registration token.
 */
async function obtainProviderAuthToken(
  dwnEndpoint : string,
  providerAuth: NonNullable<ServerInfo['providerAuth']>,
): Promise<RegistrationTokenData> {
  const state = crypto.randomUUID();
  const separator = providerAuth.authorizeUrl.includes('?') ? '&' : '?';
  const authorizeUrl =
    `${providerAuth.authorizeUrl}${separator}` +
    `redirect_uri=${encodeURIComponent(dwnEndpoint)}` +
    `&state=${encodeURIComponent(state)}`;

  // Step 1: Request an authorization code.
  const authorizeResponse = await fetch(authorizeUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!authorizeResponse.ok) {
    const text = await authorizeResponse.text();
    throw new Error(
      `Provider auth authorize failed (${authorizeResponse.status}): ${text}`,
    );
  }
  const { code, state: returnedState } =
    (await authorizeResponse.json()) as { code: string; state: string };

  if (returnedState !== state) {
    throw new Error('Provider auth state mismatch — possible CSRF');
  }

  // Step 2: Exchange the authorization code for a registration token.
  const tokenResponse = await DwnRegistrar.exchangeAuthCode(
    providerAuth.tokenUrl,
    code,
    dwnEndpoint,
  );

  return {
    registrationToken : tokenResponse.registrationToken,
    refreshToken      : tokenResponse.refreshToken,
    expiresAt         : tokenResponse.expiresIn != null
      ? Date.now() + tokenResponse.expiresIn * 1000
      : undefined,
    tokenUrl   : providerAuth.tokenUrl,
    refreshUrl : providerAuth.refreshUrl,
  };
}

/**
 * Ensure `updatedTokens[dwnEndpoint]` contains a valid (non-expired)
 * registration token, obtaining or refreshing one as needed.
 *
 * @returns The (possibly refreshed / newly obtained) token data.
 */
async function ensureValidToken(
  dwnEndpoint  : string,
  providerAuth : NonNullable<ServerInfo['providerAuth']>,
  updatedTokens: Record<string, RegistrationTokenData>,
): Promise<RegistrationTokenData> {
  let tokenData = updatedTokens[dwnEndpoint];

  if (tokenData) {
    // Refresh if expired.
    if (isTokenExpired(tokenData) && tokenData.refreshUrl && tokenData.refreshToken) {
      const refreshed = await DwnRegistrar.refreshRegistrationToken(
        tokenData.refreshUrl,
        tokenData.refreshToken,
      );
      tokenData = {
        ...tokenData,
        registrationToken : refreshed.registrationToken,
        refreshToken      : refreshed.refreshToken ?? tokenData.refreshToken,
        expiresAt         : refreshed.expiresIn
          ? Date.now() + refreshed.expiresIn * 1000
          : tokenData.expiresAt,
      };
    } else if (isTokenExpired(tokenData)) {
      // Expired but no refresh mechanism — obtain a new token from scratch.
      tokenData = await obtainProviderAuthToken(dwnEndpoint, providerAuth);
    }
  } else {
    // No cached token at all — go through the full authorize flow.
    tokenData = await obtainProviderAuthToken(dwnEndpoint, providerAuth);
  }

  updatedTokens[dwnEndpoint] = tokenData;
  return tokenData;
}

/**
 * Register a DID against a single DWN endpoint, using provider auth if
 * the endpoint requires it (obtaining a token automatically when needed),
 * otherwise falling back to the proof-of-work (PoW) registration path.
 *
 * @returns Updated tokens (may contain new / refreshed token data).
 */
export async function registerDidWithEndpoint(
  dwnEndpoint : string,
  did         : string,
  serverInfo  : ServerInfo,
  tokens      : Record<string, RegistrationTokenData>,
): Promise<Record<string, RegistrationTokenData>> {
  const updatedTokens = { ...tokens };
  const requiresProviderAuth =
    serverInfo.registrationRequirements?.includes('provider-auth-v0') &&
    serverInfo.providerAuth !== undefined;

  if (requiresProviderAuth) {
    const tokenData = await ensureValidToken(
      dwnEndpoint,
      serverInfo.providerAuth!,
      updatedTokens,
    );

    await DwnRegistrar.registerTenantWithToken(
      dwnEndpoint,
      did,
      tokenData.registrationToken,
    );
  } else {
    // PoW-based registration (default path)
    await DwnRegistrar.registerTenant(dwnEndpoint, did);
  }

  return updatedTokens;
}
