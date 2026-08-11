import type { ProfileSnapshot } from '@enbox/browser';

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetPublicProfileClientForTests,
  usePublicProfile,
} from '../public-profile';

const mocks = vi.hoisted(() => {
  const reader = {
    dispose     : vi.fn(),
    getSnapshot : vi.fn(),
    watch       : vi.fn(),
  };

  return {
    anonymous          : vi.fn(() => ({ dwn: { records: {} } })),
    createProfileReader: vi.fn(() => reader),
    reader,
    unsubscribe        : vi.fn(),
  };
});

vi.mock('@enbox/browser', () => ({
  createProfileReader: mocks.createProfileReader,
  Enbox              : { anonymous: mocks.anonymous },
}));

function settledSnapshot(did: string): ProfileSnapshot {
  return {
    did,
    status  : 'settled',
    profile : {
      status : 'settled',
      value  : {
        displayName : 'Alice',
        tagline     : 'Builder',
        bio         : 'Public bio',
      },
    },
    avatar : { status: 'settled', value: new Blob(['avatar']) },
    hero   : { status: 'settled', value: new Blob(['hero']) },
  };
}

describe('usePublicProfile', () => {
  beforeEach(() => {
    resetPublicProfileClientForTests();
    vi.clearAllMocks();
    mocks.reader.watch.mockImplementation((_, listener: () => void) => {
      listener();
      return mocks.unsubscribe;
    });
  });

  afterEach(() => {
    resetPublicProfileClientForTests();
  });

  it('binds a DID to the eager profile-reader snapshot', async () => {
    const snapshot = settledSnapshot('did:dht:alice');
    mocks.reader.getSnapshot.mockReturnValue(snapshot);

    const { result, unmount } = renderHook(() => (
      usePublicProfile('did:dht:alice', true)
    ));

    expect(result.current.data).toEqual({
      did         : 'did:dht:alice',
      displayName : 'Alice',
      tagline     : 'Builder',
      bio         : 'Public bio',
      avatar      : snapshot.avatar.value,
      hero        : snapshot.hero.value,
    });
    expect(result.current.isLoading).toBe(false);
    expect(mocks.anonymous).toHaveBeenCalledOnce();
    expect(mocks.createProfileReader).toHaveBeenCalledWith(
      expect.anything(),
      { images: 'eager' },
    );
    await waitFor(() => {
      expect(mocks.reader.watch).toHaveBeenCalledWith(
        ['did:dht:alice'],
        expect.any(Function),
      );
    });

    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not create or subscribe the reader while disabled', () => {
    const { result } = renderHook(() => usePublicProfile('', false));

    expect(result.current).toMatchObject({
      data      : undefined,
      error     : undefined,
      isError   : false,
      isLoading : false,
    });
    expect(mocks.createProfileReader).not.toHaveBeenCalled();
    expect(mocks.reader.watch).not.toHaveBeenCalled();
  });

  it('surfaces a terminal profile-reader failure', () => {
    const snapshot: ProfileSnapshot = {
      did     : 'did:dht:alice',
      status  : 'error',
      profile : {
        status  : 'error',
        failure : {
          retryable : false,
          message   : 'Profile lookup failed',
        },
      },
      avatar : { status: 'idle' },
      hero   : { status: 'idle' },
    };
    mocks.reader.getSnapshot.mockReturnValue(snapshot);

    const { result } = renderHook(() => (
      usePublicProfile('did:dht:alice', true)
    ));

    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe('Profile lookup failed');
    expect(result.current.isError).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });
});
