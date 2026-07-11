/**
 * Zero-click first identity creation.
 *
 * Right after the vault is created we craft an identity from the agent
 * DID seed — generated friendly name, avatar, and banner — so onboarding
 * lands the user in a fully usable wallet without another decision.
 * Everything is editable later from the identity page.
 */

import { createIdentity } from '@/enbox/mutations/identity-mutations';
import type { EnboxAgent } from '@/enbox/types';
import { generateAvatar, generateBanner, generateName } from './identity-generators';

/** Session flag: this tab just ran first-time onboarding. */
export const JUST_ONBOARDED_KEY = 'enbox:justOnboarded';

export function markJustOnboarded(): void {
  try {
    sessionStorage.setItem(JUST_ONBOARDED_KEY, '1');
  } catch {
    /* noop — falls back to interactive identity creation */
  }
}

/**
 * Cached in module scope so React StrictMode double-mounts (which would
 * otherwise consume the sessionStorage flag on the throwaway mount) still
 * see a stable answer. Cleared explicitly once auto-creation has run.
 */
let justOnboardedCache: boolean | null = null;

export function consumeJustOnboarded(): boolean {
  if (justOnboardedCache === null) {
    try {
      justOnboardedCache = sessionStorage.getItem(JUST_ONBOARDED_KEY) === '1';
      if (justOnboardedCache) sessionStorage.removeItem(JUST_ONBOARDED_KEY);
    } catch {
      justOnboardedCache = false;
    }
  }
  return justOnboardedCache;
}

export function clearJustOnboarded(): void {
  justOnboardedCache = false;
}

export async function autoCreateIdentity(agent: EnboxAgent, dwnEndpoints: string[]) {
  const seed = agent.agentDid.uri;
  const displayName = generateName(seed);
  const [avatar, hero] = await Promise.all([generateAvatar(seed), generateBanner(seed)]);

  return createIdentity(agent, {
    persona: displayName,
    displayName,
    avatar,
    hero,
    dwnEndpoints,
  });
}
