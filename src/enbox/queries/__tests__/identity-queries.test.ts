import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProfile } from '../identity-queries';

const mocks = vi.hoisted(() => {
  const query = vi.fn();

  return {
    query,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        using: vi.fn(() => ({ records: { query } })),
      };
    }),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
}));

vi.mock('@enbox/api/advanced', () => ({
  DwnApi: vi.fn(),
}));

vi.mock('@enbox/protocols', () => ({
  ConnectProtocol: Symbol('ConnectProtocol'),
  ProfileProtocol: Symbol('ProfileProtocol'),
}));

vi.mock('@enbox/agent', () => ({
  getDwnServiceEndpointUrls: vi.fn(),
}));

function createProfileRecord(
  avatar?: ReturnType<typeof createImageRecord>,
  hero?: ReturnType<typeof createImageRecord>,
) {
  return {
    record: { contextId: 'profile-context' },
    value: {
      displayName: 'Alice',
      tagline: 'Builder',
      bio: 'Bio',
    },
    children: { avatar, hero },
  };
}

function createImageRecord(id: string, dataCid: string) {
  return {
    record: {
      id,
      dataCid,
      dataSize: 123,
      timestamp: '2026-05-28T00:00:00.000Z',
    },
    value: new Blob([id], { type: 'image/png' }),
  };
}

describe('fetchProfile', () => {
  let urlCounter = 0;
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    urlCounter = 0;
    createObjectUrl = vi.fn(() => `blob:profile-${++urlCounter}`);
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses object URLs when refetching unchanged profile image records', async () => {
    const avatarRecord = createImageRecord('avatar-record', 'avatar-cid');
    const heroRecord = createImageRecord('hero-record', 'hero-cid');
    mocks.query.mockResolvedValue({
      records: [createProfileRecord(avatarRecord, heroRecord)],
    });

    const first = await fetchProfile({}, 'did:dht:alice');
    const second = await fetchProfile({}, 'did:dht:alice');

    expect(second.avatarUrl).toBe(first.avatarUrl);
    expect(second.heroUrl).toBe(first.heroUrl);
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenCalledWith('profile', {
      materialize: {
        children: ['profile/avatar', 'profile/hero'],
      },
      pagination: { limit: 1 },
    });
  });

  it('marks profiles without a local profile record as not hydrated', async () => {
    mocks.query.mockResolvedValue({ records: [] });

    const profile = await fetchProfile({}, 'did:dht:pending');

    expect(profile.hasProfileRecord).toBe(false);
    expect(profile.displayName).toBe('');
    expect(profile.avatarUrl).toBeUndefined();
    expect(profile.heroUrl).toBeUndefined();
  });

  it('delays revoking replaced object URLs so rendered images do not break during refetch', async () => {
    const firstAvatar = createImageRecord('avatar-record-1', 'avatar-cid-1');
    const secondAvatar = createImageRecord('avatar-record-2', 'avatar-cid-2');
    mocks.query
      .mockResolvedValueOnce({ records: [createProfileRecord(firstAvatar)] })
      .mockResolvedValueOnce({ records: [createProfileRecord(secondAvatar)] });

    const first = await fetchProfile({}, 'did:dht:bob');
    const second = await fetchProfile({}, 'did:dht:bob');

    expect(second.avatarUrl).not.toBe(first.avatarUrl);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(revokeObjectUrl).toHaveBeenCalledWith(first.avatarUrl);
  });
});
