import type { ServerInfo } from '@enbox/dwn-clients';

import { DwnRegistrar } from '@enbox/dwn-clients';

/**
 * Register a DID as a tenant on a DWN server.
 *
 * The function fetches the server's `/info` endpoint to discover which
 * registration method is required, then performs the appropriate flow:
 *
 * 1. **provider-auth-v0** — calls the provider's authorize endpoint to obtain
 *    an authorization code, exchanges it for a token, then registers the DID
 *    with that token.
 * 2. **proof-of-work-sha256-v0** — falls back to the legacy proof-of-work
 *    registration via {@link DwnRegistrar.registerTenant}.
 * 3. **No requirements** — skips registration entirely (open server).
 */
export async function registerDidWithDwn(dwnEndpoint: string, did: string): Promise<void> {
  const serverInfo = await fetchServerInfo(dwnEndpoint);

  if (serverInfo.registrationRequirements.includes('provider-auth-v0') && serverInfo.providerAuth) {
    await registerWithProviderAuth(dwnEndpoint, did, serverInfo);
  } else if (serverInfo.registrationRequirements.length > 0) {
    // Legacy proof-of-work (or any other requirement set)
    await DwnRegistrar.registerTenant(dwnEndpoint, did);
  }
  // If no registration requirements, nothing to do — server is open.
}

/**
 * Fetch the server info from a DWN endpoint.
 */
async function fetchServerInfo(dwnEndpoint: string): Promise<ServerInfo> {
  const response = await fetch(`${dwnEndpoint}/info`);
  if (!response.ok) {
    throw new Error(`Failed to fetch server info from ${dwnEndpoint}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<ServerInfo>;
}

/**
 * Register a DID using the provider-auth-v0 flow:
 *
 * 1. GET  `authorizeUrl?redirectUri=...` → `{ code }`
 * 2. POST `tokenUrl` with code            → `{ registrationToken }`
 * 3. POST `registration` with token        → 200 OK
 *
 * For the open-auth handler, the authorize endpoint returns the code directly
 * in the JSON body (no browser redirect needed).
 */
async function registerWithProviderAuth(
  dwnEndpoint: string,
  did: string,
  serverInfo: ServerInfo,
): Promise<void> {
  const providerAuth = serverInfo.providerAuth!;

  // Step 1: Get authorization code.
  // The redirect URI is not actually used for redirecting in the open-auth
  // flow, but the authorize endpoint requires it and the token exchange must
  // match it exactly.
  const redirectUri = `${window.location.origin}/auth/callback`;
  const authorizeUrl = new URL(providerAuth.authorizeUrl);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);

  const authorizeResponse = await fetch(authorizeUrl.toString());
  if (!authorizeResponse.ok) {
    const errorText = await authorizeResponse.text();
    throw new Error(`Provider auth authorize failed (${authorizeResponse.status}): ${errorText}`);
  }

  const { code } = await authorizeResponse.json() as { code: string };

  // Step 2: Exchange authorization code for registration token.
  const tokenResponse = await DwnRegistrar.exchangeAuthCode(
    providerAuth.tokenUrl,
    code,
    redirectUri,
  );

  // Step 3: Register the DID with the obtained token.
  await DwnRegistrar.registerTenantWithToken(
    dwnEndpoint,
    did,
    tokenResponse.registrationToken,
  );
}

/**
 * Register multiple DIDs with a single DWN endpoint.
 *
 * Useful when creating an identity that needs to be registered, or when the
 * agent DID and newly-created identity DID both need registration on the same
 * server. Errors are logged but do not prevent subsequent registrations.
 */
export async function registerDidsWithDwn(dwnEndpoint: string, dids: string[]): Promise<void> {
  for (const did of dids) {
    try {
      await registerDidWithDwn(dwnEndpoint, did);
    } catch (error) {
      console.error(`Failed to register DID ${did} with ${dwnEndpoint}:`, error);
    }
  }
}
