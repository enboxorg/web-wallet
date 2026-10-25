import type { ProfileSnapshot } from '@enbox/browser';

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePublicProfile } from '../public-profile';

const mocks = vi.hoisted(() => ({
  anonymous: vi.fn(() => ({ dwn: { records: {} } })),
  reader: { dispose: vi.fn(), getSnapshot: vi.fn(), watch: vi.fn() },
  unsubscribe: vi.fn(),
  releaseAfter: vi.fn(),
}));

vi.mock('@enbox/browser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/browser')>(),
  Enbox: { anonymous: mocks.anonymous },
  createProfileReader: () => mocks.reader,
  createBlobUrlPool: () => ({
    acquire: () => ({ url: 'blob:profile-image', releaseAfter: mocks.releaseAfter }),
  }),
}));

function settledSnapshot(did: string): ProfileSnapshot {
  return {
    did, status: 'settled',
    profile: { status: 'settled', value: { displayName: 'Alice', tagline: 'Builder', bio: 'Public bio' } },
    avatar: { status: 'settled', value: new Blob(['avatar']) },
    hero: { status: 'settled', value: new Blob(['hero']) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reader.watch.mockImplementation((_dids, notify: () => void) => {
    notify();
    return mocks.unsubscribe;
  });
});

describe('usePublicProfile', () => {
  it('uses the SDK profile projection and releases its watch and image leases', async () => {
    mocks.reader.getSnapshot.mockReturnValue(settledSnapshot('did:dht:alice'));
    const { result, unmount } = renderHook(() => usePublicProfile('did:dht:alice', true));
    await waitFor(() => expect(result.current.status).toBe('settled'));
    expect(result.current).toMatchObject({
      did: 'did:dht:alice', displayName: 'Alice', tagline: 'Builder', bio: 'Public bio',
      avatarUrl: 'blob:profile-image', heroUrl: 'blob:profile-image',
    });
    expect(mocks.anonymous).toHaveBeenCalledOnce();
    expect(mocks.reader.watch).toHaveBeenCalledWith(['did:dht:alice'], expect.any(Function));
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.releaseAfter).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(mocks.reader.dispose).toHaveBeenCalledOnce());
  });

  it('creates no source or watch while disabled', () => {
    const { result } = renderHook(() => usePublicProfile('', false));
    expect(result.current.status).toBe('idle');
    expect(mocks.anonymous).not.toHaveBeenCalled();
    expect(mocks.reader.watch).not.toHaveBeenCalled();
  });

  it('preserves native field failures', async () => {
    const failure = { retryable: false, message: 'Profile lookup failed' };
    mocks.reader.getSnapshot.mockReturnValue({
      did: 'did:dht:alice', status: 'error',
      profile: { status: 'error', failure },
      avatar: { status: 'idle' }, hero: { status: 'idle' },
    } satisfies ProfileSnapshot);
    const { result } = renderHook(() => usePublicProfile('did:dht:alice', true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.fields.profile.failure).toBe(failure);
    expect(result.current.displayName).toBeUndefined();
  });

  it('retires the previous DID while reusing the anonymous source', async () => {
    const alice = settledSnapshot('did:dht:alice');
    mocks.reader.getSnapshot.mockImplementation((did) => did === alice.did ? alice : undefined);
    const { result, rerender } = renderHook(({ did }) => usePublicProfile(did, true), {
      initialProps: { did: alice.did },
    });
    await waitFor(() => expect(result.current.displayName).toBe('Alice'));
    rerender({ did: 'did:dht:bob' });
    expect(result.current.did).toBe('did:dht:bob');
    expect(result.current.displayName).toBeUndefined();
    expect(mocks.anonymous).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});
