import type { EnboxAgent } from './types';

import { normalizeDwnEndpoint } from '@/lib/dwn-endpoints';

/**
 * Resolve the DID-advertised DWN endpoints for a hosted operation.
 *
 * Newer agents expose a cache-bypassing refresh that also writes the result
 * through to routing state. The fallback keeps this wallet compatible with the
 * currently published SDK until that endpoint-resolution release is installed.
 */
export async function getFreshDwnEndpoints(agent: EnboxAgent, didUri: string): Promise<string[]> {
  const identity = agent.identity as EnboxAgent['identity'] & {
    refreshDwnEndpoints?: (params: { didUri: string }) => Promise<string[]>;
  };
  if (identity.refreshDwnEndpoints !== undefined) {
    return identity.refreshDwnEndpoints({ didUri });
  }

  // Compatibility path for the currently pinned agent: passing resolution
  // options bypasses UniversalResolver's completed-result cache. Extract from
  // that fresh document directly so a stale ordinary routing cache cannot
  // influence a connect approval.
  const resolution = await agent.did.resolve(didUri, {});
  if (
    resolution.didResolutionMetadata.error !== undefined
    || resolution.didDocument === null
  ) {
    throw new Error(`Could not resolve DWN endpoints for ${didUri}.`);
  }

  const endpoints = new Set<string>();
  for (const service of resolution.didDocument.service ?? []) {
    if (service?.type !== 'DecentralizedWebNode') continue;
    const values = typeof service.serviceEndpoint === 'string'
      ? [service.serviceEndpoint]
      : service.serviceEndpoint;
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      if (typeof value !== 'string') continue;
      try {
        endpoints.add(normalizeDwnEndpoint(value));
      } catch {
        // Preserve valid siblings; an entirely malformed service fails below.
      }
    }
  }
  if (endpoints.size === 0) {
    throw new Error(`This profile does not have any valid sync endpoints configured.`);
  }
  return [...endpoints];
}
