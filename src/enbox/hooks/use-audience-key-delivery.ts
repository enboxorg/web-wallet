import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { fetchAudienceKeyDeliveries, repairAudienceKeyDelivery } from '../audience-key-delivery';
import { queryKeys } from '../queries/query-keys';
import { useAgent } from './use-agent';

export function useAudienceKeyDeliveries(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.audienceDeliveries(did),
    queryFn : () => fetchAudienceKeyDeliveries(agent, did),
    enabled : !!did,
  });
}

export function useRepairAudienceKeyDelivery(did: string) {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entry: Parameters<typeof repairAudienceKeyDelivery>[1]) =>
      repairAudienceKeyDelivery(agent, entry),
    onSettled: () => queryClient.invalidateQueries({
      queryKey: queryKeys.identities.audienceDeliveries(did),
    }),
  });
}
