/**
 * Convenience hook that combines auth-store state with provider methods.
 */

import { useAuthStore } from '@/stores/auth-store';
import { useEnboxAuth } from '../provider';

export function useAuth() {
  const { initialized, unlocked, firstTime, agent } = useAuthStore();
  const { connect, unlock, lock, error, isLoading } = useEnboxAuth();

  return {
    initialized,
    unlocked,
    firstTime,
    agent,
    connect,
    unlock,
    lock,
    error,
    isLoading,
  };
}
