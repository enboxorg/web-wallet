/**
 * Convenience hook that combines auth-store state with provider methods.
 */

import { useAuthStore } from '@/stores/auth-store';
import { useEnboxAuth } from '../provider';

export function useAuth() {
  const { initialized, firstTime, agent } = useAuthStore();
  const {
    connect,
    unlock,
    restore,
    retryInitialization,
    lock,
    changePin,
    verifyPin,
    adoptDwnEndpoints,
    dwnEndpoints,
    error,
    isLoading,
    isLocking,
  } = useEnboxAuth();

  return {
    initialized,
    unlocked: agent !== null,
    firstTime,
    agent,
    connect,
    unlock,
    restore,
    retryInitialization,
    lock,
    changePin,
    verifyPin,
    adoptDwnEndpoints,
    dwnEndpoints,
    error,
    isLoading,
    isLocking,
  };
}
