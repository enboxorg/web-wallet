import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DwnInterface, type DwnProtocolDefinition, getDwnServiceEndpointUrls } from '@enbox/agent';
import { KeyDerivationScheme } from '@enbox/dwn-sdk-js';
import { ProfileDefinition } from '@enbox/protocols';

import {
  getProtocolSetupStatus,
  hasEncryptionConfiguredForEncryptedTypes,
  protocolDefinitionsMatch,
  protocolHasEncryptedTypes,
  queryProtocolSetupStatus,
} from '../protocol-install';

vi.mock('@enbox/agent', async () => {
  const actual = await vi.importActual<typeof import('@enbox/agent')>('@enbox/agent');
  return {
    ...actual,
    getDwnServiceEndpointUrls: vi.fn(),
  };
});

const mockedGetDwnServiceEndpointUrls = vi.mocked(getDwnServiceEndpointUrls);
const queryMessage = { descriptor: { method: 'Query' } };
const configureMessage = { descriptor: { method: 'Configure' } };

function createDwn() {
  const keysByPath = new Map([
    [JSON.stringify([KeyDerivationScheme.ProtocolPath, encryptedProtocol.protocol]), 'protocol-key'],
    [JSON.stringify([KeyDerivationScheme.ProtocolPath, encryptedProtocol.protocol, 'mint']), 'mint-key'],
    [JSON.stringify([KeyDerivationScheme.ProtocolPath, encryptedProtocol.protocol, 'mint', 'proof']), 'proof-key'],
  ]);
  const derivePublicKey = vi.fn(async (path: string[]) => ({
    kty : 'OKP',
    crv : 'X25519',
    x   : keysByPath.get(JSON.stringify(path)) ?? 'unexpected-path-key',
  }));

  return {
    getEncryptionKeyDeriver: vi.fn().mockResolvedValue({
      derivePublicKey,
    }),
  };
}

function protocolQueryReply(definition?: DwnProtocolDefinition) {
  return {
    status  : { code: 200, detail: 'OK' },
    entries : definition === undefined ? [] : [{ descriptor: { definition } }],
  };
}

function createRemoteRpc(
  before: DwnProtocolDefinition | undefined,
  after: DwnProtocolDefinition | undefined,
  configureStatus = { code: 202, detail: 'Accepted' },
) {
  let queryCount = 0;
  return vi.fn(async ({ message }: { message: unknown }) => {
    if (message === queryMessage) {
      const definition = queryCount === 0 ? before : after;
      queryCount += 1;
      return protocolQueryReply(definition);
    }
    return { status: configureStatus };
  });
}

const encryptedProtocol: DwnProtocolDefinition = {
  protocol: 'https://example.com/protocols/demo',
  published: false,
  types: {
    mint: { schema: 'mint' },
    proof: { schema: 'proof', encryptionRequired: true },
  },
  structure: {
    mint: {
      $actions: [],
      proof: {
        $actions: [],
      },
    },
  },
};

const installedEncryptedProtocol: DwnProtocolDefinition = {
  ...encryptedProtocol,
  $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'protocol-key' } },
  structure: {
    mint: {
      $actions: [],
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'mint-key' } },
      proof: {
        $actions: [],
        $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'proof-key' } },
      },
    },
  },
};

const notesProtocol: DwnProtocolDefinition = {
  protocol: 'https://example.com/protocols/notes',
  published: false,
  types: {
    note: { schema: 'note' },
  },
  structure: {
    note: {
      $actions: [],
    },
  },
};

describe('protocol-install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetDwnServiceEndpointUrls.mockResolvedValue(['https://owner.example']);
  });

  it('detects encrypted protocols', () => {
    expect(protocolHasEncryptedTypes(encryptedProtocol)).toBe(true);
  });

  it('detects when an installed definition is missing $keyAgreement on encrypted paths', () => {
    expect(hasEncryptionConfiguredForEncryptedTypes(undefined, encryptedProtocol)).toBe(false);

    const installed: DwnProtocolDefinition = {
      ...encryptedProtocol,
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'protocol-key' } },
      structure: {
        mint: {
          $actions: [],
          $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'mint-key' } },
          proof: {
            $actions: [],
            $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'proof-key' } },
          },
        },
      },
    };
    expect(hasEncryptionConfiguredForEncryptedTypes(installed, encryptedProtocol)).toBe(true);
  });

  it('treats generated encryption metadata as compatible with the requested definition', () => {
    expect(protocolDefinitionsMatch(installedEncryptedProtocol, encryptedProtocol)).toBe(true);
    expect(getProtocolSetupStatus(installedEncryptedProtocol, encryptedProtocol)).toBe('configured');
  });

  it('reads installed definitions from ProtocolsConfigure query entries', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: installedEncryptedProtocol } }],
      },
    });

    await expect(queryProtocolSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      encryptedProtocol,
    )).resolves.toBe('configured');
  });

  it('verifies installed encryption keys against every complete owner derivation path', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: installedEncryptedProtocol } }],
      },
    });
    const dwn = createDwn();

    await expect(queryProtocolSetupStatus(
      'did:example:owner',
      { dwn, processDwnRequest },
      encryptedProtocol,
    )).resolves.toBe('configured');

    const keyDeriver = await dwn.getEncryptionKeyDeriver.mock.results[0].value;
    expect(keyDeriver.derivePublicKey.mock.calls).toEqual([
      [[KeyDerivationScheme.ProtocolPath, encryptedProtocol.protocol]],
      [[KeyDerivationScheme.ProtocolPath, encryptedProtocol.protocol, 'mint']],
      [[KeyDerivationScheme.ProtocolPath, encryptedProtocol.protocol, 'mint', 'proof']],
    ]);
  });

  it('marks a custom protocol installed with a different definition as overridable', () => {
    const olderInstalledDefinition: DwnProtocolDefinition = {
      ...notesProtocol,
      types: {
        note: { schema: 'old-note' },
      },
    };

    expect(protocolDefinitionsMatch(olderInstalledDefinition, notesProtocol)).toBe(false);
    // A non-canonical protocol may be replaced by the owner on explicit override.
    expect(getProtocolSetupStatus(olderInstalledDefinition, notesProtocol)).toBe('override');
  });

  it('keeps a canonical protocol installed with a different definition hard-blocked', () => {
    const legacyInstalledProfile = {
      ...ProfileDefinition,
      types: {
        ...ProfileDefinition.types,
        profile: { schema: 'https://legacy.example/profile' },
      },
    } as DwnProtocolDefinition;

    // The requested definition IS the canonical pin; only the installed one
    // differs. Canonical wallet protocols are never overridable via a connection.
    expect(protocolDefinitionsMatch(legacyInstalledProfile, ProfileDefinition as DwnProtocolDefinition)).toBe(false);
    expect(getProtocolSetupStatus(legacyInstalledProfile, ProfileDefinition as DwnProtocolDefinition)).toBe('conflict');
  });

  it('treats legacy $encryption metadata as a policy-identical upgrade', () => {
    const legacyInstalled = {
      ...encryptedProtocol,
      structure: {
        mint: {
          $actions: [],
          proof: {
            $actions: [],
            $encryption: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'legacy-key' } },
          },
        },
      },
    } as DwnProtocolDefinition;

    expect(protocolDefinitionsMatch(legacyInstalled, encryptedProtocol)).toBe(true);
    expect(getProtocolSetupStatus(legacyInstalled, encryptedProtocol)).toBe('upgrade');
  });

  it('finds encrypted types nested below a differently named parent', () => {
    const nestedProtocol: DwnProtocolDefinition = {
      protocol: 'https://example.com/protocols/chat',
      published: false,
      types: {
        thread: {},
        chat: { encryptionRequired: true },
      },
      structure: {
        thread: {
          chat: {},
        },
      },
    };
    const nestedInstalled: DwnProtocolDefinition = {
      ...nestedProtocol,
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'protocol-key' } },
      structure: {
        thread: {
          $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'thread-key' } },
          chat: {
            $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'chat-key' } },
          },
        },
      },
    };

    expect(hasEncryptionConfiguredForEncryptedTypes(nestedInstalled, nestedProtocol)).toBe(true);
    delete (nestedInstalled.structure.thread.chat as any).$keyAgreement;
    expect(hasEncryptionConfiguredForEncryptedTypes(nestedInstalled, nestedProtocol)).toBe(false);
  });

  it('upgrades when an encrypted reader role is missing its derived path key', () => {
    const roleProtocol: DwnProtocolDefinition = {
      protocol: 'https://example.com/protocols/role-chat',
      published: false,
      types: {
        participant: {},
        message: { encryptionRequired: true },
      },
      structure: {
        participant: {
          $role: true,
        },
        message: {
          $actions: [{ role: 'participant', can: ['read'] }],
        },
      },
    };
    const partialInstall: DwnProtocolDefinition = {
      ...roleProtocol,
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'protocol-key' } },
      structure: {
        participant: {
          $role: true,
        },
        message: {
          $actions: [{ role: 'participant', can: ['read'] }],
          $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'message-key' } },
        },
      },
    };

    expect(hasEncryptionConfiguredForEncryptedTypes(partialInstall, roleProtocol)).toBe(false);
    expect(getProtocolSetupStatus(partialInstall, roleProtocol)).toBe('upgrade');
  });

  it('rejects a spoofed definition for a wallet-pinned protocol URI', () => {
    const spoofedProfile = {
      ...ProfileDefinition,
      types: {
        ...ProfileDefinition.types,
        profile: { schema: 'https://evil.example/profile' },
      },
    } as DwnProtocolDefinition;

    expect(getProtocolSetupStatus(undefined, ProfileDefinition as DwnProtocolDefinition)).toBe('install');
    expect(getProtocolSetupStatus(undefined, spoofedProfile)).toBe('conflict');

    const nonNormalizedSpoof = {
      ...spoofedProfile,
      protocol: 'HTTPS://identity.foundation/protocols/profile',
    } as DwnProtocolDefinition;
    expect(getProtocolSetupStatus(undefined, nonNormalizedSpoof)).toBe('conflict');
  });

  it('rejects installed encryption keys that are not derived from the wallet owner', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: installedEncryptedProtocol } }],
      },
    });
    const dwn = createDwn();
    dwn.getEncryptionKeyDeriver.mockResolvedValue({
      derivePublicKey: vi.fn(async () => ({
        kty : 'OKP',
        crv : 'X25519',
        x   : 'different-owner-key',
      })),
    });

    await expect(queryProtocolSetupStatus(
      'did:example:owner',
      { dwn, processDwnRequest },
      encryptedProtocol,
    )).resolves.toBe('conflict');
  });

});
