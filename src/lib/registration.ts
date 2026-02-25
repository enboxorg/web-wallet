/**
 * Provider-auth registration token management.
 *
 * Persists `RegistrationTokenData` (keyed by DWN endpoint URL) in localStorage
 * so that tokens survive page reloads and can be passed back into
 * `Web5.connect()` or used directly with `DwnRegistrar` on subsequent sessions.
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
 * Register a DID against a single DWN endpoint, using provider auth if
 * the endpoint requires it and a valid token exists, otherwise falling
 * back to the proof-of-work (PoW) registration path.
 *
 * If a cached token is expired and a refresh URL is available, the token
 * is refreshed automatically before registration.
 *
 * @returns Updated tokens (may contain refreshed token data).
 */
export async function registerDidWithEndpoint(
  dwnEndpoint : string,
  did         : string,
  serverInfo  : ServerInfo,
  tokens      : Record<string, RegistrationTokenData>,
): Promise<Record<string, RegistrationTokenData>> {
  const updatedTokens = { ...tokens };
  const requiresProviderAuth = serverInfo.registrationRequirements?.includes('provider-auth-v0')
                            && serverInfo.providerAuth !== undefined;

  if (requiresProviderAuth && updatedTokens[dwnEndpoint]) {
    let tokenData = updatedTokens[dwnEndpoint];

    // Refresh if expired
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
      updatedTokens[dwnEndpoint] = tokenData;
    }

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
