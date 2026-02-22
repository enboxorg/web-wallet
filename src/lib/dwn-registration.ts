import { DwnRegistrar } from '@enbox/dwn-clients';

/**
 * Provider auth configuration from the server's `/info` endpoint.
 *
 * Defined locally to avoid depending on unpublished types from
 * `@enbox/dwn-clients`. Once a new version of dwn-clients is published with
 * the `ProviderAuthInfo` type, this can be replaced with the import.
 */
type ProviderAuthInfo = {
  authorizeUrl  : string;
  tokenUrl      : string;
  refreshUrl?   : string;
  managementUrl?: string;
};

/**
 * Minimal server info shape needed for registration discovery.
 */
type ServerInfo = {
  registrationRequirements : string[];
  providerAuth?            : ProviderAuthInfo;
};

/**
 * Response from the token exchange endpoint.
 */
type TokenExchangeResponse = {
  registrationToken : string;
  refreshToken?     : string;
  expiresIn?        : number;
  tokenType         : string;
};

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
  const tokenResponse = await exchangeAuthCode(providerAuth.tokenUrl, code, redirectUri);

  // Step 3: Register the DID with the obtained token.
  await registerTenantWithToken(dwnEndpoint, did, tokenResponse.registrationToken);
}

/**
 * Exchange an authorization code for a registration token.
 *
 * Inlined here because `DwnRegistrar.exchangeAuthCode` is not yet available
 * in the published npm version of `@enbox/dwn-clients`. Once a new version is
 * published, this can be replaced with `DwnRegistrar.exchangeAuthCode()`.
 */
async function exchangeAuthCode(
  tokenUrl: string,
  code: string,
  redirectUri: string,
): Promise<TokenExchangeResponse> {
  const response = await fetch(tokenUrl, {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify({
      grantType : 'authorization_code',
      code,
      redirectUri,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<TokenExchangeResponse>;
}

/**
 * Register a DID as a tenant using a provider auth registration token.
 *
 * Inlined here because `DwnRegistrar.registerTenantWithToken` is not yet
 * available in the published npm version of `@enbox/dwn-clients`. Once a new
 * version is published, this can be replaced.
 */
async function registerTenantWithToken(
  dwnEndpoint: string,
  did: string,
  registrationToken: string,
): Promise<void> {
  const response = await fetch(`${dwnEndpoint}/registration`, {
    method  : 'POST',
    headers : { 'Content-Type': 'application/json' },
    body    : JSON.stringify({
      providerAuth     : { registrationToken },
      registrationData : { did },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Provider auth registration failed (${response.status}): ${errorText}`);
  }
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
