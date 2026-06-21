import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../queries/query-keys';
import { useAgent } from './use-agent';
import {
  addSocialFriend,
  addSocialGroupMember,
  blockSocialDid,
  createSocialGroup,
  deleteSocialGroup,
  fetchSocialGraph,
  removeSocialFriend,
  removeSocialGroupMember,
  unblockSocialDid,
  type AddSocialFriendParams,
  type AddSocialGroupMemberParams,
  type BlockSocialDidParams,
  type CreateSocialGroupParams,
  type DeleteSocialGroupParams,
  type RemoveSocialFriendParams,
  type RemoveSocialGroupMemberParams,
  type UnblockSocialDidParams,
} from '../social-graph';

function useSocialGraphInvalidation(ownerDid: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.identities.socialGraph(ownerDid),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.identities.activity(ownerDid),
    });
  };
}

export function useSocialGraph(did: string) {
  const agent = useAgent();

  return useQuery({
    queryKey: queryKeys.identities.socialGraph(did),
    queryFn: () => fetchSocialGraph(agent, did),
    enabled: !!did,
  });
}

export function useAddSocialFriend(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<AddSocialFriendParams, 'ownerDid'>) =>
      addSocialFriend(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useRemoveSocialFriend(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<RemoveSocialFriendParams, 'ownerDid'>) =>
      removeSocialFriend(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useCreateSocialGroup(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<CreateSocialGroupParams, 'ownerDid'>) =>
      createSocialGroup(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useDeleteSocialGroup(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<DeleteSocialGroupParams, 'ownerDid'>) =>
      deleteSocialGroup(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useAddSocialGroupMember(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<AddSocialGroupMemberParams, 'ownerDid'>) =>
      addSocialGroupMember(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useRemoveSocialGroupMember(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<RemoveSocialGroupMemberParams, 'ownerDid'>) =>
      removeSocialGroupMember(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useBlockSocialDid(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<BlockSocialDidParams, 'ownerDid'>) =>
      blockSocialDid(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}

export function useUnblockSocialDid(ownerDid: string) {
  const agent = useAgent();
  const invalidate = useSocialGraphInvalidation(ownerDid);

  return useMutation({
    mutationFn: (params: Omit<UnblockSocialDidParams, 'ownerDid'>) =>
      unblockSocialDid(agent, { ownerDid, ...params }),
    onSuccess: invalidate,
  });
}
