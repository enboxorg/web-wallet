import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addSocialFriend,
  blockSocialDid,
  fetchSocialGraph,
  validateSocialDid,
} from '../social-graph';

const mocks = vi.hoisted(() => {
  const queryAllResults = new Map<string, unknown[]>();
  const socialTyped = {
    records: {
      queryAll: vi.fn((path: string, request?: { filter?: { parentContextId?: string } }) => {
        const parentContextId = request?.filter?.parentContextId;
        const scopedKey = parentContextId === undefined
          ? path
          : `${path}:${parentContextId}`;
        const records = queryAllResults.get(scopedKey) ?? queryAllResults.get(path) ?? [];

        return (async function* () {
          for (const item of records) {
            yield item;
          }
        })();
      }),
    },
  };
  const socialRepo = {
    friend: {
      create: vi.fn(),
    },
    block: {
      create: vi.fn(),
    },
    group: {
      create: vi.fn(),
      member: {
        create: vi.fn(),
      },
    },
  };

  return {
    queryAllResults,
    socialTyped,
    socialRepo,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        using: vi.fn(() => socialTyped),
      };
    }),
    repository: vi.fn(() => socialRepo),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
  repository: mocks.repository,
}));

vi.mock('@enbox/protocols', () => ({
  SocialGraphProtocol: Symbol('SocialGraphProtocol'),
}));

function record<T>(
  id: string,
  data: T,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    contextId: `${id}-context`,
    dateCreated: '2026-06-21T00:00:00.000Z',
    timestamp: '2026-06-21T00:00:00.000Z',
    tags: 'did' in (data as Record<string, unknown>)
      ? { did: (data as Record<string, unknown>).did }
      : undefined,
    data: {
      json: vi.fn(async () => data),
    },
    update: vi.fn(async () => ({ status: { code: 202 } })),
    delete: vi.fn(async () => ({ status: { code: 202 } })),
    ...extra,
  };
}

describe('social graph data layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryAllResults.clear();
    mocks.socialRepo.friend.create.mockResolvedValue({
      status: { code: 202 },
      record: record('friend-new', { did: 'did:dht:bob' }),
    });
    mocks.socialRepo.block.create.mockResolvedValue({
      status: { code: 202 },
      record: record('block-new', { did: 'did:dht:eve' }),
    });
  });

  it('validates DID input before social graph mutations', () => {
    expect(validateSocialDid('did:dht:alice')).toBeUndefined();
    expect(validateSocialDid(' did:dht:alice ')).toBeUndefined();
    expect(validateSocialDid('did dht alice')).toMatch(/cannot contain spaces/i);
    expect(validateSocialDid('https://example.test')).toMatch(/valid DID/i);
  });

  it('normalizes friends, blocks, groups, and members from protocol records', async () => {
    mocks.queryAllResults.set('friend', [
      record('friend-1', {
        did: 'did:dht:bob',
        alias: 'Bob',
        note: 'Trusted contact',
      }, { recipient: 'did:dht:bob' }),
    ]);
    mocks.queryAllResults.set('block', [
      record('block-1', {
        did: 'did:dht:eve',
        reason: 'Spam',
      }),
    ]);
    mocks.queryAllResults.set('group', [
      record('group-1', {
        name: 'Builders',
        description: 'Project contacts',
      }),
    ]);
    mocks.queryAllResults.set('group/member:group-1-context', [
      record('member-1', {
        did: 'did:dht:carol',
        alias: 'Carol',
      }),
    ]);

    const graph = await fetchSocialGraph({}, 'did:dht:alice');

    expect(graph.friends).toEqual([
      expect.objectContaining({
        id: 'friend-1',
        did: 'did:dht:bob',
        alias: 'Bob',
        recipient: 'did:dht:bob',
      }),
    ]);
    expect(graph.blocks).toEqual([
      expect.objectContaining({
        id: 'block-1',
        did: 'did:dht:eve',
        reason: 'Spam',
      }),
    ]);
    expect(graph.groups).toEqual([
      expect.objectContaining({
        id: 'group-1',
        contextId: 'group-1-context',
        name: 'Builders',
        members: [
          expect.objectContaining({
            id: 'member-1',
            did: 'did:dht:carol',
            alias: 'Carol',
          }),
        ],
      }),
    ]);
  });

  it('creates friend role records with recipient and DID tag', async () => {
    await addSocialFriend({}, {
      ownerDid: 'did:dht:alice',
      friendDid: 'did:dht:bob',
      alias: 'Bob',
      note: 'Trusted contact',
    });

    expect(mocks.socialRepo.friend.create).toHaveBeenCalledWith({
      data: {
        did: 'did:dht:bob',
        alias: 'Bob',
        note: 'Trusted contact',
      },
      recipient: 'did:dht:bob',
      tags: { did: 'did:dht:bob' },
    });
  });

  it('does not add a friend while that DID is blocked', async () => {
    mocks.queryAllResults.set('block', [record('block-1', { did: 'did:dht:bob' })]);

    await expect(addSocialFriend({}, {
      ownerDid: 'did:dht:alice',
      friendDid: 'did:dht:bob',
    })).rejects.toThrow(/blocked/i);

    expect(mocks.socialRepo.friend.create).not.toHaveBeenCalled();
  });

  it('removes existing friend records before blocking a DID', async () => {
    const friendRecord = record('friend-1', { did: 'did:dht:bob' });
    mocks.queryAllResults.set('friend', [friendRecord]);

    await blockSocialDid({}, {
      ownerDid: 'did:dht:alice',
      blockedDid: 'did:dht:bob',
      reason: 'Abuse',
    });

    expect(friendRecord.delete).toHaveBeenCalled();
    expect(mocks.socialRepo.block.create).toHaveBeenCalledWith({
      data: {
        did: 'did:dht:bob',
        reason: 'Abuse',
      },
      tags: { did: 'did:dht:bob' },
    });
  });

  it('drains every page instead of truncating large social graphs', async () => {
    mocks.queryAllResults.set('friend', Array.from({ length: 250 }, (_, index) =>
      record(`friend-${index}`, { did: `did:dht:friend${index}` })
    ));

    const graph = await fetchSocialGraph({}, 'did:dht:alice');

    expect(graph.friends).toHaveLength(250);
    expect(mocks.socialTyped.records.queryAll).toHaveBeenCalledWith('friend', {
      dateSort: 'createdDescending',
      pageSize: 100,
    });
  });
});
