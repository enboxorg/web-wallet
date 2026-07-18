import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAudienceKeyDeliveries,
  repairAudienceKeyDelivery,
  type AudienceKeyDeliveryEntry,
} from '../audience-key-delivery';

const mocks = vi.hoisted(() => {
  const recordsByRole = new Map<string, Array<{ recipient?: string; contextId?: string }>>();
  const protocolDefinitions: unknown[] = [];
  const protocolsQuery = vi.fn(async () => ({
    protocols: protocolDefinitions.map((definition) => ({ definition })),
    status: { code: 200, detail: 'OK' },
  }));
  const queryAll = vi.fn((request: {
    filter: { protocol: string; protocolPath: string };
  }) => {
    const key = `${request.filter.protocol}|${request.filter.protocolPath}`;
    const records = recordsByRole.get(key) ?? [];
    return (async function* () {
      for (const record of records) {
        yield record;
      }
    })();
  });

  return {
    recordsByRole,
    protocolDefinitions,
    protocolsQuery,
    queryAll,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        dwn: {
          protocols: { query: protocolsQuery },
          records: { queryAll },
        },
      };
    }),
  };
});

vi.mock('@enbox/api', () => ({ Enbox: mocks.Enbox }));

const encryptedProtocol = {
  protocol: 'https://example.com/encrypted-chat',
  published: true,
  types: {},
  structure: {
    member: {
      $role: true,
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'root-key' } },
    },
    observer: {
      $role: true,
    },
    thread: {
      member: {
        $role: true,
        $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'nested-key' } },
      },
    },
  },
};

function createAgent(options: { delegateDid?: string } = {}) {
  return {
    sync: {
      getIdentityOptions: vi.fn(async () => options),
    },
    dwn: {
      getAudienceKeyDeliveryStatus: vi.fn(async (params) => ({
        status: 'delivered' as const,
        recipientDid: params.recipientDid,
        keyId: 'current-key',
      })),
      reprovisionAudienceKeyDelivery: vi.fn(),
    },
  };
}

describe('audience key delivery data layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordsByRole.clear();
    mocks.protocolDefinitions.length = 0;
    mocks.protocolDefinitions.push(encryptedProtocol);
  });

  it('checks root and nested deliverable roles with the correct authorization context', async () => {
    mocks.recordsByRole.set(`${encryptedProtocol.protocol}|member`, [{
      recipient: 'did:dht:bob',
      contextId: 'member-record',
    }]);
    mocks.recordsByRole.set(`${encryptedProtocol.protocol}|thread/member`, [{
      recipient: 'did:dht:carol',
      contextId: 'thread-1/member-1',
    }]);
    const agent = createAgent({ delegateDid: 'did:dht:delegate' });

    const entries = await fetchAudienceKeyDeliveries(agent, 'did:dht:alice');

    expect(entries).toHaveLength(2);
    expect(mocks.Enbox).toHaveBeenCalledWith({
      agent,
      connectedDid: 'did:dht:alice',
      delegateDid : 'did:dht:delegate',
    });
    expect(mocks.queryAll).toHaveBeenCalledWith({
      filter: {
        protocol    : encryptedProtocol.protocol,
        protocolPath: 'member',
      },
      pageSize: 100,
    });
    expect(mocks.queryAll).toHaveBeenCalledWith({
      filter: {
        protocol    : encryptedProtocol.protocol,
        protocolPath: 'thread/member',
      },
      pageSize: 100,
    });
    expect(agent.dwn.getAudienceKeyDeliveryStatus).toHaveBeenCalledWith({
      target      : 'did:dht:alice',
      protocol    : encryptedProtocol.protocol,
      rolePath    : 'member',
      recipientDid: 'did:dht:bob',
      granteeDid  : 'did:dht:delegate',
    });
    expect(agent.dwn.getAudienceKeyDeliveryStatus).toHaveBeenCalledWith({
      target      : 'did:dht:alice',
      protocol    : encryptedProtocol.protocol,
      rolePath    : 'thread/member',
      recipientDid: 'did:dht:carol',
      contextId   : 'thread-1/member-1',
      granteeDid  : 'did:dht:delegate',
    });
  });

  it('deduplicates role records that resolve to the same audience tuple', async () => {
    mocks.recordsByRole.set(`${encryptedProtocol.protocol}|thread/member`, [
      { recipient: 'did:dht:bob', contextId: 'thread-1/member-1' },
      { recipient: 'did:dht:bob', contextId: 'thread-1/member-2' },
    ]);
    const agent = createAgent();

    const entries = await fetchAudienceKeyDeliveries(agent, 'did:dht:alice');

    expect(entries).toHaveLength(1);
    expect(agent.dwn.getAudienceKeyDeliveryStatus).toHaveBeenCalledOnce();
  });

  it('reports an individual status failure as unverifiable', async () => {
    mocks.recordsByRole.set(`${encryptedProtocol.protocol}|member`, [{
      recipient: 'did:dht:bob',
    }]);
    const agent = createAgent();
    agent.dwn.getAudienceKeyDeliveryStatus.mockRejectedValue(new Error('remote unavailable'));

    const entries = await fetchAudienceKeyDeliveries(agent, 'did:dht:alice');

    expect(entries[0].status).toEqual({
      status      : 'unverifiable',
      recipientDid: 'did:dht:bob',
      reason      : 'remote unavailable',
    });
  });

  it('fails visibly when installed protocols cannot be inspected', async () => {
    mocks.protocolsQuery.mockResolvedValueOnce({
      protocols: [],
      status: { code: 403, detail: 'Forbidden' },
    });

    await expect(fetchAudienceKeyDeliveries(createAgent(), 'did:dht:alice'))
      .rejects.toThrow(/403 Forbidden/);
  });

  it('repairs owner-authorized delivery without rewriting the role record', async () => {
    const agent = createAgent();
    agent.dwn.reprovisionAudienceKeyDelivery.mockResolvedValue({
      delivered: true,
      recipientDid: 'did:dht:bob',
    });
    const entry = {
      key         : 'entry',
      ownerDid    : 'did:dht:alice',
      protocol    : encryptedProtocol.protocol,
      rolePath    : 'thread/member',
      recipientDid: 'did:dht:bob',
      contextId   : 'thread-1/member-1',
      status      : {
        status      : 'not-delivered',
        recipientDid: 'did:dht:bob',
        reason      : 'missing delivery',
      },
    } satisfies AudienceKeyDeliveryEntry;

    await repairAudienceKeyDelivery(agent, entry);

    expect(agent.dwn.reprovisionAudienceKeyDelivery).toHaveBeenCalledWith({
      target      : 'did:dht:alice',
      protocol    : encryptedProtocol.protocol,
      rolePath    : 'thread/member',
      recipientDid: 'did:dht:bob',
      contextId   : 'thread-1/member-1',
    });
  });

  it('refuses delegated repair because it cannot safely deduplicate deliveries', async () => {
    const agent = createAgent();
    const entry = {
      key         : 'entry',
      ownerDid    : 'did:dht:alice',
      protocol    : encryptedProtocol.protocol,
      rolePath    : 'member',
      recipientDid: 'did:dht:bob',
      granteeDid  : 'did:dht:delegate',
      status      : {
        status      : 'unverifiable',
        recipientDid: 'did:dht:bob',
        reason      : 'delegate visibility',
      },
    } satisfies AudienceKeyDeliveryEntry;

    await expect(repairAudienceKeyDelivery(agent, entry)).rejects.toThrow(/identity owner/i);
    expect(agent.dwn.reprovisionAudienceKeyDelivery).not.toHaveBeenCalled();
  });
});
