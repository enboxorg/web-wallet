import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchActivity,
  fetchPermissionHistory,
  fetchPermissions,
  fetchProfile,
  fetchProtocols,
} from '../identity-queries';

const mocks = vi.hoisted(() => {
  const activityQuery = vi.fn();
  const close = vi.fn();
  const protocolQuery = vi.fn();
  const query = vi.fn();

  return {
    activityQuery,
    close,
    protocolQuery,
    query,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        close,
        dwn: {
          protocols: { query: protocolQuery },
          records: { query: activityQuery },
        },
        using: vi.fn(() => ({ records: { query } })),
      };
    }),
  };
});

vi.mock('@enbox/browser', () => ({
  Enbox: mocks.Enbox,
}));

vi.mock('@enbox/protocols', () => ({
  ConnectProtocol: Symbol('ConnectProtocol'),
  ProfileProtocol: Symbol('ProfileProtocol'),
}));

vi.mock('@enbox/agent', () => ({
  DwnDateSort: { CreatedDescending: 'createdDescending' },
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

function createImageRecord(id: string, dataCid: string | undefined) {
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('projects raw profile image blobs with stable record keys', async () => {
    const avatarRecord = createImageRecord('avatar-record', 'avatar-cid');
    const heroRecord = createImageRecord('hero-record', 'hero-cid');
    mocks.query.mockResolvedValue({
      records: [createProfileRecord(avatarRecord, heroRecord)],
    });

    const first = await fetchProfile({}, 'did:dht:alice');
    const second = await fetchProfile({}, 'did:dht:alice');

    expect(first.avatar).toEqual({ blob: avatarRecord.value, key: 'avatar-cid' });
    expect(first.hero).toEqual({ blob: heroRecord.value, key: 'hero-cid' });
    expect(second.avatar).toEqual(first.avatar);
    expect(second.hero).toEqual(first.hero);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query).toHaveBeenCalledWith('profile', {
      materialize: {
        children: ['profile/avatar', 'profile/hero'],
      },
      pagination: { limit: 1 },
    });
    expect(mocks.close).toHaveBeenCalledTimes(2);
  });

  it('marks profiles without a local profile record as not hydrated', async () => {
    mocks.query.mockResolvedValue({ records: [] });

    const profile = await fetchProfile({}, 'did:dht:pending');

    expect(profile.hasProfileRecord).toBe(false);
    expect(profile.displayName).toBe('');
    expect(profile.avatar).toBeUndefined();
    expect(profile.hero).toBeUndefined();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('falls back to record identity when an image has no data CID', async () => {
    const avatarRecord = createImageRecord('avatar-record', undefined);
    mocks.query.mockResolvedValue({ records: [createProfileRecord(avatarRecord)] });

    const profile = await fetchProfile({}, 'did:dht:bob');

    expect(profile.avatar?.key).toBe('avatar-record|2026-05-28T00:00:00.000Z');
  });
});

describe('raw DWN reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses and closes the Enbox raw-DWN escape hatch for protocols', async () => {
    mocks.protocolQuery.mockResolvedValue({
      protocols: [{
        definition: {
          protocol  : 'https://example.com/protocol',
          published : true,
        },
      }],
    });

    await expect(fetchProtocols({} as never, 'did:dht:alice')).resolves.toEqual([{
      uri        : 'https://example.com/protocol',
      published  : true,
      definition : {
        protocol  : 'https://example.com/protocol',
        published : true,
      },
    }]);
    expect(mocks.protocolQuery).toHaveBeenCalledWith({});
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('uses and closes the Enbox raw-DWN escape hatch for activity', async () => {
    mocks.activityQuery.mockResolvedValue({
      records: [{
        id          : 'record-1',
        protocol    : 'https://example.com/protocol',
        protocolPath: 'note',
        dateCreated : '2026-08-11T00:00:00.000Z',
        author      : 'did:dht:alice',
      }],
    });

    await expect(fetchActivity({} as never, 'did:dht:alice', 5)).resolves.toEqual([{
      id           : 'record-1',
      protocol     : 'https://example.com/protocol',
      protocolPath : 'note',
      schema       : undefined,
      dataFormat   : undefined,
      dateCreated  : '2026-08-11T00:00:00.000Z',
      author       : 'did:dht:alice',
      published    : undefined,
    }]);
    expect(mocks.activityQuery).toHaveBeenCalledWith({
      filter     : {},
      dateSort   : 'createdDescending',
      pagination : { limit: 5 },
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('closes the Enbox facade when a raw read fails', async () => {
    mocks.activityQuery.mockRejectedValue(new Error('query failed'));

    await expect(fetchActivity({} as never, 'did:dht:alice')).rejects.toThrow('query failed');
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});

describe('fetchPermissions', () => {
  it('returns active grants from the agent permission catalog', async () => {
    const grant = { id: 'grant-1' };
    const fetchGrants = vi.fn(async () => [{ grant, message: {} }]);

    const permissions = await fetchPermissions({
      permissions: { fetchGrants },
    } as never, 'did:dht:alice');

    expect(fetchGrants).toHaveBeenCalledWith({
      author       : 'did:dht:alice',
      target       : 'did:dht:alice',
      checkRevoked : true,
    });
    expect(permissions).toEqual([grant]);
  });

  it('fetches isolated grant history without filtering revocations', async () => {
    const grant = { id: 'revoked-grant-1' };
    const fetchGrants = vi.fn(async () => [{ grant, message: {} }]);

    const permissions = await fetchPermissionHistory({
      permissions: { fetchGrants },
    } as never, 'did:dht:alice');

    expect(fetchGrants).toHaveBeenCalledWith({
      author       : 'did:dht:alice',
      target       : 'did:dht:alice',
      checkRevoked : false,
    });
    expect(permissions).toEqual([grant]);
  });

  it('filters internal session revocation grants out of both permission views', async () => {
    const sessionGrant = {
      id    : 'grant-1',
      scope : { interface: 'Records', method: 'Read', protocol: 'https://example.com/protocols/demo' },
    };
    const revocationGrant = {
      id    : 'revocation-grant-1',
      scope : {
        interface : 'Records',
        method    : 'Write',
        protocol  : 'https://identity.foundation/dwn/permissions',
        contextId : 'grant-1',
      },
    };
    const fetchGrants = vi.fn(async () => [
      { grant: sessionGrant, message: {} },
      { grant: revocationGrant, message: {} },
    ]);
    const agent = { permissions: { fetchGrants } };

    await expect(fetchPermissions(agent as never, 'did:dht:alice'))
      .resolves.toEqual([sessionGrant]);
    await expect(fetchPermissionHistory(agent as never, 'did:dht:alice'))
      .resolves.toEqual([sessionGrant]);
  });
});
