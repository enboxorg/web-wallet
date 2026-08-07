import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installProtocols } from '../protocols';

const mocks = vi.hoisted(() => {
  const definitions = {
    profile: { protocol: 'https://identity.foundation/protocols/profile' },
    connect: { protocol: 'https://identity.foundation/protocols/connect' },
  };
  const protocolObjects = {
    profile: {
      toJSON: vi.fn(() => ({ descriptor: { definition: definitions.profile } })),
    },
    connect: {
      toJSON: vi.fn(() => ({ descriptor: { definition: definitions.connect } })),
    },
  };
  const configureResults = {
    profile: vi.fn(async () => ({
      status: { code: 202, detail: 'Accepted' },
      protocol: protocolObjects.profile,
    })),
    connect: vi.fn(async () => ({
      status: { code: 202, detail: 'Accepted' },
      protocol: protocolObjects.connect,
    })),
  };
  const typedProtocols = {
    profile: { definition: definitions.profile, codecs: {} },
    connect: { definition: definitions.connect, codecs: {} },
  };

  return {
    definitions,
    protocolObjects,
    configureResults,
    typedProtocols,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
        using: vi.fn((typedProtocol) => {
          switch (typedProtocol.definition.protocol) {
            case definitions.profile.protocol:
              return { configure: configureResults.profile };
            case definitions.connect.protocol:
              return { configure: configureResults.connect };
            default:
              throw new Error(`Unexpected protocol ${typedProtocol.definition.protocol}`);
          }
        }),
      };
    }),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
}));

vi.mock('@enbox/protocols', () => ({
  ProfileProtocol: mocks.typedProtocols.profile,
  ConnectProtocol: mocks.typedProtocols.connect,
}));

describe('installProtocols', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configureResults.profile.mockResolvedValue({
      status: { code: 202, detail: 'Accepted' },
      protocol: mocks.protocolObjects.profile,
    });
    mocks.configureResults.connect.mockResolvedValue({
      status: { code: 202, detail: 'Accepted' },
      protocol: mocks.protocolObjects.connect,
    });
  });

  it('configures required protocols locally', async () => {
    await installProtocols({}, 'did:dht:alice');

    expect(mocks.configureResults.profile).toHaveBeenCalledOnce();
    expect(mocks.configureResults.connect).toHaveBeenCalledOnce();
  });

  it('accepts existing local protocols as installed', async () => {
    mocks.configureResults.profile.mockResolvedValue({
      status: { code: 200, detail: 'OK' },
      protocol: mocks.protocolObjects.profile,
    });
    mocks.configureResults.connect.mockResolvedValue({
      status: { code: 200, detail: 'OK' },
      protocol: mocks.protocolObjects.connect,
    });

    await installProtocols({}, 'did:dht:alice');

    expect(mocks.configureResults.profile).toHaveBeenCalledOnce();
    expect(mocks.configureResults.connect).toHaveBeenCalledOnce();
  });

  it('throws on local protocol configuration failures before downstream protocols', async () => {
    mocks.configureResults.profile.mockResolvedValue({
      status: { code: 400, detail: 'ProtocolsConfigureInvalidDefinition' },
      protocol: undefined,
    });

    await expect(installProtocols({}, 'did:dht:alice')).rejects.toThrow(
      'Failed to install protocol https://identity.foundation/protocols/profile',
    );
    expect(mocks.configureResults.connect).not.toHaveBeenCalled();
  });
});
