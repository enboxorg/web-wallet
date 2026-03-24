/**
 * Mutation hooks for identity CRUD operations.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAgent } from './use-agent';
import { queryKeys } from '../queries/query-keys';
import {
  createIdentity,
  updateIdentityProfile,
  updateDwnEndpoints,
  deleteIdentity,
  exportIdentity,
  importIdentity,
  type CreateIdentityParams,
  type UpdateIdentityProfileParams,
  type UpdateDwnEndpointsParams,
} from '../mutations/identity-mutations';

export function useCreateIdentity() {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateIdentityParams) => createIdentity(agent, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
    },
  });
}

export function useUpdateIdentityProfile() {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateIdentityProfileParams) =>
      updateIdentityProfile(agent, params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.identities.profile(variables.did),
      });
    },
  });
}

export function useUpdateDwnEndpoints() {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateDwnEndpointsParams) =>
      updateDwnEndpoints(agent, params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.identities.dwnEndpoints(variables.did),
      });
    },
  });
}

export function useDeleteIdentity() {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (did: string) => deleteIdentity(agent, did),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
    },
  });
}

export function useExportIdentity() {
  const agent = useAgent();

  return useMutation({
    mutationFn: (did: string) => exportIdentity(agent, did),
  });
}

export function useImportIdentity() {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (portableIdentity: any) => importIdentity(agent, portableIdentity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
    },
  });
}
