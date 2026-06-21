import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addSocialFriend,
  blockSocialDid,
  fetchSocialGraph,
  validateSocialDid,
} from '../social-graph';

const mocks = vi.hoisted(() => {
  const socialRepo = {
    friend: {
      query: vi.fn(),
      create: vi.fn(),
    },
    block: {
      query: vi.fn(),
      create: vi.fn(),
    },
    group: {
      query: vi.fn(),
      create: vi.fn(),
      member: {
        query: vi.fn(),
        create: vi.fn(),
      },
    },
  };

  return {
    socialRepo,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        using: vi.fn((protocol) => protocol),
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
    mocks.socialRepo.friend.query.mockResolvedValue({ records: [] });
    mocks.socialRepo.friend.create.mockResolvedValue({
      status: { code: 202 },
      record: record('friend-new', { did: 'did:dht:bob' }),
    });
    mocks.socialRepo.block.query.mockResolvedValue({ records: [] });
    mocks.socialRepo.block.create.mockResolvedValue({
      status: { code: 202 },
      record: record('block-new', { did: 'did:dht:eve' }),
    });
    mocks.socialRepo.group.query.mockResolvedValue({ records: [] });
    mocks.socialRepo.group.member.query.mockResolvedValue({ records: [] });
  });

  it('validates DID input before social graph mutations', () => {
    expect(validateSocialDid('did:dht:alice')).toBeUndefined();
    expect(validateSocialDid(' did:dht:alice ')).toBeUndefined();
    expect(validateSocialDid('did dht alice')).toMatch(/cannot contain spaces/i);
    expect(validateSocialDid('https://example.test')).toMatch(/valid DID/i);
  });

  it('normalizes friends, blocks, groups, and members from protocol records', async () => {
    mocks.socialRepo.friend.query.mockResolvedValue({
      records: [
        record('friend-1', {
          did: 'did:dht:bob',
          alias: 'Bob',
          note: 'Trusted contact',
        }, { recipient: 'did:dht:bob' }),
      ],
    });
    mocks.socialRepo.block.query.mockResolvedValue({
      records: [
        record('block-1', {
          did: 'did:dht:eve',
          reason: 'Spam',
        }),
      ],
    });
    mocks.socialRepo.group.query.mockResolvedValue({
      records: [
        record('group-1', {
          name: 'Builders',
          description: 'Project contacts',
        }),
      ],
    });
    mocks.socialRepo.group.member.query.mockResolvedValue({
      records: [
        record('member-1', {
          did: 'did:dht:carol',
          alias: 'Carol',
        }),
      ],
    });

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
    mocks.socialRepo.block.query.mockResolvedValue({
      records: [record('block-1', { did: 'did:dht:bob' })],
    });

    await expect(addSocialFriend({}, {
      ownerDid: 'did:dht:alice',
      friendDid: 'did:dht:bob',
    })).rejects.toThrow(/blocked/i);

    expect(mocks.socialRepo.friend.create).not.toHaveBeenCalled();
  });

  it('removes existing friend records before blocking a DID', async () => {
    const friendRecord = record('friend-1', { did: 'did:dht:bob' });
    mocks.socialRepo.friend.query.mockResolvedValue({ records: [friendRecord] });

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
});
