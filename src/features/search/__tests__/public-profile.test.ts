import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileDefinition } from '@enbox/protocols';

import {
  fetchPublicProfile,
  resetPublicProfileClientForTests,
} from '../public-profile';

const mocks = vi.hoisted(() => {
  const records = {
    query: vi.fn(),
    read: vi.fn(),
  };

  return {
    records,
    anonymous: vi.fn(() => ({
      dwn: { records },
    })),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: {
    anonymous: mocks.anonymous,
  },
}));

function jsonRecord(data: Record<string, unknown>) {
  return {
    data: {
      json: vi.fn(async () => data),
    },
  };
}

function blobRecord(id: string) {
  return {
    dataSize: id.length,
    data: {
      blob: vi.fn(async () => new Blob([id], { type: 'image/png' })),
    },
  };
}

describe('fetchPublicProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPublicProfileClientForTests();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => `blob:${blob.size}`),
    });
  });

  it('reads public text by query and unpublished media by direct read', async () => {
    mocks.records.query.mockResolvedValue({
      status: { code: 200 },
      records: [
        jsonRecord({
          displayName: 'Alice',
          tagline: 'Builder',
          bio: 'Public bio',
          did: 'did:dht:spoofed',
          avatar: 'https://attacker.invalid/avatar.png',
        }),
      ],
    });
    mocks.records.read.mockImplementation(async ({ filter }: { filter: { protocolPath: string } }) => {
      const id = filter.protocolPath === 'profile/avatar' ? 'avatar' : 'hero';
      return { status: { code: 200 }, record: blobRecord(id) };
    });

    const profile = await fetchPublicProfile('did:dht:alice');

    expect(mocks.anonymous).toHaveBeenCalledOnce();
    expect(profile).toMatchObject({
      did: 'did:dht:alice',
      displayName: 'Alice',
      tagline: 'Builder',
      bio: 'Public bio',
      avatarUrl: 'blob:6',
      heroUrl: 'blob:4',
    });
    expect(mocks.records.query).toHaveBeenCalledWith({
      from: 'did:dht:alice',
      filter: {
        protocol: ProfileDefinition.protocol,
        protocolPath: 'profile',
      },
    });
    expect(mocks.records.read).toHaveBeenCalledTimes(2);
    expect(mocks.records.read.mock.calls.map(([request]) => request.filter.protocolPath).sort()).toEqual([
      'profile/avatar',
      'profile/hero',
    ]);
  });

  it('keeps the profile result when optional media is absent', async () => {
    mocks.records.query.mockResolvedValue({
      status: { code: 200 },
      records: [jsonRecord({ displayName: 'Bob' })],
    });
    mocks.records.read.mockResolvedValue({ status: { code: 404 } });

    const profile = await fetchPublicProfile('did:dht:bob');

    expect(profile.displayName).toBe('Bob');
    expect(profile.avatarUrl).toBeUndefined();
    expect(profile.heroUrl).toBeUndefined();
  });

  it('does not expose orphaned media when the root profile is absent', async () => {
    mocks.records.query.mockResolvedValue({ status: { code: 200 }, records: [] });

    const profile = await fetchPublicProfile('did:dht:missing');

    expect(profile).toEqual({
      did: 'did:dht:missing',
      displayName: '',
      tagline: undefined,
      bio: undefined,
      avatarUrl: undefined,
      heroUrl: undefined,
    });
    expect(mocks.records.read).not.toHaveBeenCalled();
  });
});
