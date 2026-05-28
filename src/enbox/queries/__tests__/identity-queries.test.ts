import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchProfile } from '../identity-queries';

const mocks = vi.hoisted(() => {
  const repo = {
    profile: {
      get: vi.fn(),
      avatar: { get: vi.fn() },
      hero: { get: vi.fn() },
    },
  };

  return {
    repo,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
      using: vi.fn((protocol) => protocol),
      };
    }),
    repository: vi.fn(() => repo),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
  repository: mocks.repository,
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

function createProfileRecord() {
  return {
    contextId: 'profile-context',
    data: {
      json: vi.fn(async () => ({
        displayName: 'Alice',
        tagline: 'Builder',
        bio: 'Bio',
      })),
    },
  };
}

function createImageRecord(id: string, dataCid: string) {
  return {
    id,
    dataCid,
    dataSize: 123,
    timestamp: '2026-05-28T00:00:00.000Z',
    data: {
      blob: vi.fn(async () => new Blob([id], { type: 'image/png' })),
    },
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
    const profileRecord = createProfileRecord();
    const avatarRecord = createImageRecord('avatar-record', 'avatar-cid');
    const heroRecord = createImageRecord('hero-record', 'hero-cid');
    mocks.repo.profile.get.mockResolvedValue(profileRecord);
    mocks.repo.profile.avatar.get.mockResolvedValue(avatarRecord);
    mocks.repo.profile.hero.get.mockResolvedValue(heroRecord);

    const first = await fetchProfile({}, 'did:dht:alice');
    const second = await fetchProfile({}, 'did:dht:alice');

    expect(second.avatarUrl).toBe(first.avatarUrl);
    expect(second.heroUrl).toBe(first.heroUrl);
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
  });

  it('delays revoking replaced object URLs so rendered images do not break during refetch', async () => {
    const profileRecord = createProfileRecord();
    const firstAvatar = createImageRecord('avatar-record-1', 'avatar-cid-1');
    const secondAvatar = createImageRecord('avatar-record-2', 'avatar-cid-2');
    mocks.repo.profile.get.mockResolvedValue(profileRecord);
    mocks.repo.profile.avatar.get
      .mockResolvedValueOnce(firstAvatar)
      .mockResolvedValueOnce(secondAvatar);
    mocks.repo.profile.hero.get.mockResolvedValue(undefined);

    const first = await fetchProfile({}, 'did:dht:bob');
    const second = await fetchProfile({}, 'did:dht:bob');

    expect(second.avatarUrl).not.toBe(first.avatarUrl);
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(revokeObjectUrl).toHaveBeenCalledWith(first.avatarUrl);
  });
});
