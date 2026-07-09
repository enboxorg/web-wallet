import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DwnInterface, type DwnProtocolDefinition, getDwnServiceEndpointUrls } from '@enbox/agent';
import { ProfileDefinition } from '@enbox/protocols';

import {
  getProtocolSetupStatus,
  hasEncryptionConfiguredForEncryptedTypes,
  prepareProtocol,
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
  return {
    getEncryptionKeyDeriver: vi.fn().mockResolvedValue({
      derivePublicKey: vi.fn(async (path: string[]) => {
        const finalSegment = path.at(-1);
        const x = finalSegment === 'mint'
          ? 'mint-key'
          : finalSegment === 'proof'
            ? 'proof-key'
            : 'protocol-key';
        return { kty: 'OKP', crv: 'X25519', x };
      }),
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

  it('detects older or different installed protocol definitions', () => {
    const olderInstalledDefinition: DwnProtocolDefinition = {
      ...notesProtocol,
      types: {
        note: { schema: 'old-note' },
      },
    };

    expect(protocolDefinitionsMatch(olderInstalledDefinition, notesProtocol)).toBe(false);
    expect(getProtocolSetupStatus(olderInstalledDefinition, notesProtocol)).toBe('conflict');
  });

  it('configures encrypted protocols with encryption: true when first installing', async () => {
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({ reply: protocolQueryReply(), message: queryMessage })
      .mockResolvedValueOnce({ reply: { status: { code: 202, detail: 'Accepted' } }, message: configureMessage });
    const sendDwnRequest = createRemoteRpc(undefined, installedEncryptedProtocol);

    await prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, encryptedProtocol);

    expect(processDwnRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      author: 'did:example:owner',
      target: 'did:example:owner',
      messageType: DwnInterface.ProtocolsConfigure,
      encryption: true,
    }));
    expect(sendDwnRequest).toHaveBeenCalledTimes(3);
  });

  it('does not create a new configure message when the installed protocol is current', async () => {
    const installedEntry = {
      descriptor: {
        method: 'Configure',
        definition: installedEncryptedProtocol,
      },
    };
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({
        reply   : { status: { code: 200, detail: 'OK' }, entries: [installedEntry] },
        message : queryMessage,
      });
    const sendDwnRequest = createRemoteRpc(installedEncryptedProtocol, installedEncryptedProtocol);

    await prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, encryptedProtocol);

    expect(processDwnRequest).toHaveBeenCalledTimes(1);
    expect(sendDwnRequest).toHaveBeenCalledTimes(1);
    expect(sendDwnRequest).not.toHaveBeenCalledWith(expect.objectContaining({ message: installedEntry }));
  });

  it('fans out the existing signed configure when local setup is current but a remote is missing it', async () => {
    const installedEntry = {
      descriptor: {
        method: 'Configure',
        definition: installedEncryptedProtocol,
      },
    };
    const processDwnRequest = vi.fn().mockResolvedValueOnce({
      reply   : { status: { code: 200, detail: 'OK' }, entries: [installedEntry] },
      message : queryMessage,
    });
    const sendDwnRequest = createRemoteRpc(undefined, installedEncryptedProtocol);

    await prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, encryptedProtocol);

    expect(processDwnRequest).toHaveBeenCalledTimes(1);
    expect(sendDwnRequest).toHaveBeenCalledWith(expect.objectContaining({
      message: installedEntry,
    }));
    expect(sendDwnRequest).toHaveBeenCalledTimes(3);
  });

  it('upgrades a policy-identical encrypted install that is missing $keyAgreement', async () => {
    const staleInstalled = {
      descriptor: { definition: encryptedProtocol },
    };
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({
        reply   : { status: { code: 200, detail: 'OK' }, entries: [staleInstalled] },
        message : queryMessage,
      })
      .mockResolvedValueOnce({
        reply   : { status: { code: 202, detail: 'Accepted' } },
        message : configureMessage,
      });
    const sendDwnRequest = createRemoteRpc(encryptedProtocol, installedEncryptedProtocol);

    expect(getProtocolSetupStatus(encryptedProtocol, encryptedProtocol)).toBe('upgrade');
    await prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, encryptedProtocol);

    expect(processDwnRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      messageType: DwnInterface.ProtocolsConfigure,
      encryption: true,
    }));
    expect(sendDwnRequest).toHaveBeenCalledTimes(3);
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

  it('rejects installed protocols when the definition differs', async () => {
    const olderInstalledDefinition: DwnProtocolDefinition = {
      ...notesProtocol,
      types: {
        note: { schema: 'old-note' },
      },
    };
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({
        reply: {
          status  : { code: 200, detail: 'OK' },
          entries : [{ descriptor: { definition: olderInstalledDefinition } }],
        },
        message: queryMessage,
      });
    const sendDwnRequest = vi.fn().mockResolvedValue({ status: { code: 202, detail: 'Accepted' } });

    await expect(prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, notesProtocol)).rejects.toThrow('already installed with a different definition');

    expect(processDwnRequest).toHaveBeenCalledTimes(1);
    expect(sendDwnRequest).not.toHaveBeenCalled();
  });

  it('rejects requester-supplied wallet key metadata', async () => {
    const requestedDefinition: DwnProtocolDefinition = {
      ...notesProtocol,
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'requester-key' } },
    };
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: { status: { code: 200, detail: 'OK' }, entries: [] },
      message: queryMessage,
    });
    const sendDwnRequest = vi.fn();

    expect(getProtocolSetupStatus(undefined, requestedDefinition)).toBe('conflict');
    await expect(prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, requestedDefinition)).rejects.toThrow('contains wallet-managed encryption keys');
    expect(processDwnRequest).toHaveBeenCalledTimes(1);
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

  it('rejects a conflicting remote latest definition before local configuration', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply   : protocolQueryReply(),
      message : queryMessage,
    });
    const remoteConflict = {
      ...notesProtocol,
      types: { note: { schema: 'https://example.com/schemas/other' } },
    } as DwnProtocolDefinition;
    const sendDwnRequest = createRemoteRpc(remoteConflict, remoteConflict);

    await expect(prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, notesProtocol)).rejects.toThrow('conflicts with the latest definition');
    expect(processDwnRequest).toHaveBeenCalledTimes(1);
    expect(sendDwnRequest).toHaveBeenCalledTimes(1);
  });

  it('fails when local protocol configuration is rejected', async () => {
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({ reply: protocolQueryReply(), message: queryMessage })
      .mockResolvedValueOnce({ reply: { status: { code: 400, detail: 'Invalid definition' } } });
    const sendDwnRequest = createRemoteRpc(undefined, undefined);

    await expect(prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, notesProtocol)).rejects.toThrow('Could not configure protocol: Invalid definition');
    expect(sendDwnRequest).toHaveBeenCalledTimes(1);
  });

  it('fails when remote replies do not converge to the requested latest protocol', async () => {
    mockedGetDwnServiceEndpointUrls.mockResolvedValue([
      'https://owner-a.example',
      'https://owner-b.example',
    ]);
    const processDwnRequest = vi
      .fn()
      .mockResolvedValueOnce({ reply: protocolQueryReply(), message: queryMessage })
      .mockResolvedValueOnce({
        reply   : { status: { code: 202, detail: 'Accepted' } },
        message : configureMessage,
      });
    const sendDwnRequest = createRemoteRpc(undefined, undefined, { code: 202, detail: 'Accepted as history' });

    await expect(prepareProtocol('did:example:owner', {
      did: {},
      dwn: createDwn(),
      processDwnRequest,
      rpc: { sendDwnRequest },
    }, notesProtocol)).rejects.toThrow('Could not verify the latest protocol definition');
    expect(sendDwnRequest).toHaveBeenCalledTimes(6);
  });
});
