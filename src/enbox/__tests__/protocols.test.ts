import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installProtocols } from '../protocols';

const mocks = vi.hoisted(() => {
  const definitions = {
    social: { protocol: 'https://identity.foundation/protocols/social-graph' },
    profile: { protocol: 'https://identity.foundation/protocols/profile' },
    connect: { protocol: 'https://identity.foundation/protocols/connect' },
  };
  const protocolObjects = {
    social: {
      toJSON: vi.fn(() => ({ descriptor: { definition: definitions.social } })),
      send: vi.fn(),
    },
    profile: {
      toJSON: vi.fn(() => ({ descriptor: { definition: definitions.profile } })),
      send: vi.fn(),
    },
    connect: {
      toJSON: vi.fn(() => ({ descriptor: { definition: definitions.connect } })),
      send: vi.fn(),
    },
  };
  const configureResults = {
    social: vi.fn(async () => ({
      status: { code: 202, detail: 'Accepted' },
      protocol: protocolObjects.social,
    })),
    profile: vi.fn(async () => ({
      status: { code: 202, detail: 'Accepted' },
      protocol: protocolObjects.profile,
    })),
    connect: vi.fn(async () => ({
      status: { code: 202, detail: 'Accepted' },
      protocol: protocolObjects.connect,
    })),
  };

  return {
    definitions,
    protocolObjects,
    configureResults,
    defineProtocol: vi.fn((definition) => definition),
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        using: vi.fn((definition) => {
          switch (definition.protocol) {
            case definitions.social.protocol:
              return { configure: configureResults.social };
            case definitions.profile.protocol:
              return { configure: configureResults.profile };
            case definitions.connect.protocol:
              return { configure: configureResults.connect };
            default:
              throw new Error(`Unexpected protocol ${definition.protocol}`);
          }
        }),
      };
    }),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
  defineProtocol: mocks.defineProtocol,
}));

vi.mock('@enbox/protocols', () => ({
  SocialGraphDefinition: mocks.definitions.social,
  ProfileDefinition: mocks.definitions.profile,
  ConnectDefinition: mocks.definitions.connect,
}));

describe('installProtocols', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configureResults.social.mockResolvedValue({
      status: { code: 202, detail: 'Accepted' },
      protocol: mocks.protocolObjects.social,
    });
    mocks.configureResults.profile.mockResolvedValue({
      status: { code: 202, detail: 'Accepted' },
      protocol: mocks.protocolObjects.profile,
    });
    mocks.configureResults.connect.mockResolvedValue({
      status: { code: 202, detail: 'Accepted' },
      protocol: mocks.protocolObjects.connect,
    });
  });

  it('sends each newly configured protocol to every DWN endpoint in dependency order', async () => {
    const agent = {
      rpc: {
        sendDwnRequest: vi.fn(async () => ({
          status: { code: 202, detail: 'Accepted' },
        })),
      },
    };
    const endpoints = ['https://aws.example/dwn', 'https://fly.example/dwn'];

    await installProtocols(agent, 'did:dht:alice', endpoints);

    expect(agent.rpc.sendDwnRequest).toHaveBeenCalledTimes(6);
    expect(agent.rpc.sendDwnRequest).toHaveBeenNthCalledWith(1, {
      dwnUrl: endpoints[0],
      targetDid: 'did:dht:alice',
      message: { descriptor: { definition: mocks.definitions.social } },
    });
    expect(agent.rpc.sendDwnRequest).toHaveBeenNthCalledWith(2, {
      dwnUrl: endpoints[1],
      targetDid: 'did:dht:alice',
      message: { descriptor: { definition: mocks.definitions.social } },
    });
    expect(agent.rpc.sendDwnRequest).toHaveBeenNthCalledWith(3, {
      dwnUrl: endpoints[0],
      targetDid: 'did:dht:alice',
      message: { descriptor: { definition: mocks.definitions.profile } },
    });
    expect(agent.rpc.sendDwnRequest).toHaveBeenNthCalledWith(5, {
      dwnUrl: endpoints[0],
      targetDid: 'did:dht:alice',
      message: { descriptor: { definition: mocks.definitions.connect } },
    });
    expect(mocks.protocolObjects.social.send).not.toHaveBeenCalled();
    expect(mocks.protocolObjects.profile.send).not.toHaveBeenCalled();
    expect(mocks.protocolObjects.connect.send).not.toHaveBeenCalled();
  });

  it('remote-sends existing local protocols so a missed endpoint can be repaired', async () => {
    mocks.configureResults.social.mockResolvedValue({
      status: { code: 200, detail: 'OK' },
      protocol: mocks.protocolObjects.social,
    });
    mocks.configureResults.profile.mockResolvedValue({
      status: { code: 200, detail: 'OK' },
      protocol: mocks.protocolObjects.profile,
    });
    mocks.configureResults.connect.mockResolvedValue({
      status: { code: 200, detail: 'OK' },
      protocol: mocks.protocolObjects.connect,
    });

    const agent = {
      rpc: {
        sendDwnRequest: vi.fn(async () => ({
          status: { code: 409, detail: 'Conflict' },
        })),
      },
    };

    await installProtocols(agent, 'did:dht:alice', ['https://fly.example/dwn']);

    expect(agent.rpc.sendDwnRequest).toHaveBeenCalledTimes(3);
  });

  it('retries an endpoint protocol chain when the remote DWN cannot resolve a newly published DID yet', async () => {
    vi.useFakeTimers();

    const calls: string[] = [];
    const agent = {
      rpc: {
        sendDwnRequest: vi.fn(async ({ dwnUrl, message }) => {
          const protocol = message.descriptor.definition.protocol;
          calls.push(`${dwnUrl}:${protocol}`);

          if (
            dwnUrl === 'https://fly.example/dwn' &&
            protocol === mocks.definitions.social.protocol &&
            calls.filter((call) => call === `${dwnUrl}:${protocol}`).length === 1
          ) {
            return {
              status: {
                code: 401,
                detail: 'GeneralJwsVerifierGetPublicKeyNotFound: Pkarr record not found',
              },
            };
          }

          return { status: { code: 202, detail: 'Accepted' } };
        }),
      },
    };

    try {
      const result = installProtocols(agent, 'did:dht:alice', [
        'https://aws.example/dwn',
        'https://fly.example/dwn',
      ]);

      await vi.advanceTimersByTimeAsync(1_000);
      await result;
    } finally {
      vi.useRealTimers();
    }

    expect(calls.filter((call) => call.startsWith('https://fly.example/dwn:'))).toEqual([
      `https://fly.example/dwn:${mocks.definitions.social.protocol}`,
      `https://fly.example/dwn:${mocks.definitions.social.protocol}`,
      `https://fly.example/dwn:${mocks.definitions.profile.protocol}`,
      `https://fly.example/dwn:${mocks.definitions.connect.protocol}`,
    ]);
  });

  it('throws on non-retryable remote protocol failures before writing downstream protocols to that endpoint', async () => {
    const calls: string[] = [];
    const agent = {
      rpc: {
        sendDwnRequest: vi.fn(async ({ dwnUrl, message }) => {
          const protocol = message.descriptor.definition.protocol;
          calls.push(`${dwnUrl}:${protocol}`);

          if (dwnUrl === 'https://fly.example/dwn') {
            return {
              status: {
                code: 400,
                detail: 'ProtocolsConfigureInvalidDefinition',
              },
            };
          }

          return { status: { code: 202, detail: 'Accepted' } };
        }),
      },
    };

    await expect(installProtocols(agent, 'did:dht:alice', [
      'https://aws.example/dwn',
      'https://fly.example/dwn',
    ])).rejects.toThrow('Failed to install required protocols');

    expect(calls.filter((call) => call.startsWith('https://fly.example/dwn:'))).toEqual([
      `https://fly.example/dwn:${mocks.definitions.social.protocol}`,
    ]);
  });
});
