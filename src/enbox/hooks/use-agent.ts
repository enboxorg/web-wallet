/**
 * Hook that returns the authenticated Enbox agent.
 * Throws if the wallet is not unlocked — only use inside authenticated routes.
 */

import { useAuthStore } from '@/stores/auth-store';
import type { EnboxAgent } from '../types';

export function useAgent(): EnboxAgent {
  const agent = useAuthStore((s) => s.agent);
  if (!agent) {
    throw new Error('useAgent must be used when wallet is unlocked');
  }
  return agent;
}
