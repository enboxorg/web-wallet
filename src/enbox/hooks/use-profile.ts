/**
 * Hook for fetching the profile (social data, avatar, hero) of a DID.
 */

import { useQuery } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import { fetchProfile } from '../queries/identity-queries';

export function useProfile(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.profile(did),
    queryFn: () => fetchProfile(agent, did),
    enabled: !!did,
  });
}
