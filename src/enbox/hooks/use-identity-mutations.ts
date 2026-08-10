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
  PublishedIdentitySetupError,
  type CreateIdentityParams,
  type UpdateIdentityProfileParams,
  type UpdateDwnEndpointsParams,
} from '../mutations/identity-mutations';

type IdentityLike = {
  did?: {
    uri?: string;
  };
};

function getIdentityDid(identity: unknown): string | undefined {
  if (typeof identity !== 'object' || identity === null) return undefined;
  const did = (identity as IdentityLike).did?.uri;
  return typeof did === 'string' ? did : undefined;
}

function upsertIdentity(existing: unknown, identity: unknown): unknown[] {
  const current = Array.isArray(existing) ? existing : [];
  const did = getIdentityDid(identity);
  if (!did) return current;

  const index = current.findIndex((item) => getIdentityDid(item) === did);
  if (index === -1) return [...current, identity];

  return current.map((item, itemIndex) =>
    itemIndex === index ? identity : item
  );
}

export function useCreateIdentity() {
  const agent = useAgent();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateIdentityParams) => createIdentity(agent, params),
    onSuccess: (identity) => {
      queryClient.setQueryData(
        queryKeys.identities.all,
        (existing) => upsertIdentity(existing, identity),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
    },
    onError: (error) => {
      const publishedIdentity = error instanceof PublishedIdentitySetupError
        ? error.publishedIdentity
        : undefined;
      if (publishedIdentity !== undefined) {
        queryClient.setQueryData(
          queryKeys.identities.all,
          (existing) => upsertIdentity(existing, publishedIdentity),
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
      }
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
