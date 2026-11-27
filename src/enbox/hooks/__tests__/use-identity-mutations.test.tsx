import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { queryKeys } from '../../queries/query-keys';
import { useCreateIdentity, useUpdateIdentityProfile } from '../use-identity-mutations';
import { PublishedIdentitySetupError } from '../../mutations/identity-mutations';

const mocks = vi.hoisted(() => ({
  agent: { id: 'agent-1' },
  createIdentity: vi.fn(),
  updateIdentityProfile: vi.fn(),
}));

vi.mock('../use-agent', () => ({
  useAgent: () => mocks.agent,
}));

vi.mock('../../mutations/identity-mutations', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../mutations/identity-mutations')>(),
  createIdentity: mocks.createIdentity,
  updateIdentityProfile: mocks.updateIdentityProfile,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useCreateIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds the identities cache with the created identity before refetching', async () => {
    const queryClient = createQueryClient();
    const identity = { did: { uri: 'did:example:new' }, metadata: { name: 'New' } };
    const params = {
      persona      : 'Personal',
      displayName  : 'Alice',
      dwnEndpoints : ['https://dwn.example'],
    };
    mocks.createIdentity.mockResolvedValue(identity);

    const { result } = renderHook(() => useCreateIdentity(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync(params);

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.identities.all)).toEqual([identity]);
    });
    expect(mocks.createIdentity).toHaveBeenCalledWith(mocks.agent, params);
  });

  it('replaces an existing cached identity with the created identity', async () => {
    const queryClient = createQueryClient();
    const oldIdentity = { did: { uri: 'did:example:existing' }, metadata: { name: 'Old' } };
    const newIdentity = { did: { uri: 'did:example:existing' }, metadata: { name: 'New' } };
    queryClient.setQueryData(queryKeys.identities.all, [oldIdentity]);
    mocks.createIdentity.mockResolvedValue(newIdentity);

    const { result } = renderHook(() => useCreateIdentity(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      persona      : 'Personal',
      displayName  : 'Alice',
      dwnEndpoints : ['https://dwn.example'],
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.identities.all)).toEqual([newIdentity]);
    });
  });

  it('keeps a published identity discoverable when later setup fails', async () => {
    const queryClient = createQueryClient();
    const identity = { did: { uri: 'did:dht:published' }, metadata: { name: 'New' } };
    const error = new PublishedIdentitySetupError(identity, new Error('registration failed'));
    mocks.createIdentity.mockRejectedValue(error);

    const { result } = renderHook(() => useCreateIdentity(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({
      persona      : 'Personal',
      displayName  : 'Alice',
      dwnEndpoints : ['https://dwn.example'],
    })).rejects.toBe(error);

    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.identities.all)).toEqual([identity]);
    });
  });
});

describe('useUpdateIdentityProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateIdentityProfile.mockResolvedValue(undefined);
  });

  it('invalidates the identities list when persona changes', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateIdentityProfile(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      did         : 'did:dht:alice',
      persona     : 'Work',
      displayName : 'Alice',
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:alice'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
      exact: true,
    });
  });

  it('still invalidates exact identities list on partial-save failure when persona was submitted', async () => {
    mocks.updateIdentityProfile.mockRejectedValueOnce(new Error('DWN write failed'));
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateIdentityProfile(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync({
      did         : 'did:dht:alice',
      persona     : 'Work',
      displayName : 'Alice',
    })).rejects.toThrow('DWN write failed');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:alice'),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.all,
      exact: true,
    });
  });

  it('only invalidates the profile query when persona is omitted', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateIdentityProfile(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      did         : 'did:dht:alice',
      displayName : 'Alice',
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.identities.profile('did:dht:alice'),
    });
  });

  it('awaits profile and identities cache invalidation before resolving mutateAsync', async () => {
    const queryClient = createQueryClient();
    let resolveProfileInvalidation!: () => void;
    let resolveIdentitiesInvalidation!: () => void;
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation((filters) => {
      const key = filters?.queryKey;
      if (Array.isArray(key) && key.length === 1 && key[0] === 'identities') {
        return new Promise<void>((resolve) => { resolveIdentitiesInvalidation = resolve; });
      }
      return new Promise<void>((resolve) => { resolveProfileInvalidation = resolve; });
    });

    const { result } = renderHook(() => useUpdateIdentityProfile(), {
      wrapper: createWrapper(queryClient),
    });

    let settled = false;
    const mutationPromise = result.current.mutateAsync({
      did         : 'did:dht:alice',
      persona     : 'Work',
      displayName : 'Alice Updated',
    }).then(() => {
      settled = true;
    });

    await waitFor(() => expect(resolveProfileInvalidation).toBeDefined());
    await waitFor(() => expect(resolveIdentitiesInvalidation).toBeDefined());
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveProfileInvalidation();
    await Promise.resolve();
    expect(settled).toBe(false);

    resolveIdentitiesInvalidation();
    await mutationPromise;
    expect(settled).toBe(true);
  });
});
