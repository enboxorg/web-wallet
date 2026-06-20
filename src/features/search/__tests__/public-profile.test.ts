import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPublicProfile,
  resetPublicProfileClientForTests,
} from '../public-profile';

const mocks = vi.hoisted(() => {
  const records = {
    query: vi.fn(),
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

vi.mock('@enbox/protocols', () => ({
  ProfileDefinition: {
    protocol: 'https://identity.foundation/protocols/profile',
  },
}));

function jsonRecord(data: Record<string, string | undefined>) {
  return {
    data: {
      json: vi.fn(async () => data),
    },
  };
}

function blobRecord(id: string) {
  return {
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

  it('reads public social data and media through anonymous DWN queries', async () => {
    mocks.records.query.mockImplementation(async ({ filter }: any) => {
      switch (filter.protocolPath) {
        case 'profile':
          return {
            records: [
              jsonRecord({
                displayName: 'Alice',
                tagline: 'Builder',
                bio: 'Public bio',
              }),
            ],
          };
        case 'profile/avatar':
          return { records: [blobRecord('avatar')] };
        case 'profile/hero':
          return { records: [blobRecord('hero')] };
        default:
          return { records: [] };
      }
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
  });

  it('keeps the profile result when optional media queries fail', async () => {
    mocks.records.query.mockImplementation(async ({ filter }: any) => {
      if (filter.protocolPath === 'profile') {
        return {
          records: [
            jsonRecord({
              displayName: 'Bob',
            }),
          ],
        };
      }
      throw new Error('media unavailable');
    });

    const profile = await fetchPublicProfile('did:dht:bob');

    expect(profile.displayName).toBe('Bob');
    expect(profile.avatarUrl).toBeUndefined();
    expect(profile.heroUrl).toBeUndefined();
  });
});
