import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { queryKeys } from '../../queries/query-keys';
import { useCreateIdentity } from '../use-identity-mutations';

const mocks = vi.hoisted(() => ({
  agent: { id: 'agent-1' },
  createIdentity: vi.fn(),
}));

vi.mock('../use-agent', () => ({
  useAgent: () => mocks.agent,
}));

vi.mock('../../mutations/identity-mutations', () => ({
  createIdentity: mocks.createIdentity,
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
});
