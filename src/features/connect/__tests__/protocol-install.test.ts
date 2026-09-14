import { describe, expect, it, vi } from 'vitest';
import type { DwnProtocolDefinition } from '@enbox/agent';
import { KeyDerivationScheme } from '@enbox/dwn-sdk-js';
import { ProfileDefinition } from '@enbox/protocols';

import {
  getRequestedProtocolDefinitionsConflictMessage,
  protocolDefinitionsMatch,
  protocolHasEncryptedTypes,
  queryProtocolSetupStatus,
} from '../protocol-install';

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
  it('detects encrypted protocols', () => {
    expect(protocolHasEncryptedTypes(encryptedProtocol)).toBe(true);
  });

  it('treats generated encryption metadata as compatible with the requested definition', () => {
    expect(protocolDefinitionsMatch(installedEncryptedProtocol, encryptedProtocol)).toBe(true);
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

  it('maps an SDK definition conflict for a custom protocol to an explicit override', async () => {
    const olderInstalledDefinition: DwnProtocolDefinition = {
      ...notesProtocol,
      types: {
        note: { schema: 'old-note' },
      },
    };
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: olderInstalledDefinition } }],
      },
    });

    expect(protocolDefinitionsMatch(olderInstalledDefinition, notesProtocol)).toBe(false);
    await expect(queryProtocolSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      notesProtocol,
    )).resolves.toBe('override');
  });

  it('keeps an SDK definition conflict for a canonical protocol hard-blocked', async () => {
    const legacyInstalledProfile = {
      ...ProfileDefinition,
      types: {
        ...ProfileDefinition.types,
        profile: { schema: 'https://legacy.example/profile' },
      },
    } as DwnProtocolDefinition;
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: legacyInstalledProfile } }],
      },
    });

    // The requested definition IS the canonical pin; only the installed one
    // differs. Canonical wallet protocols are never overridable via a connection.
    expect(protocolDefinitionsMatch(legacyInstalledProfile, ProfileDefinition as DwnProtocolDefinition)).toBe(false);
    await expect(queryProtocolSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      ProfileDefinition as DwnProtocolDefinition,
    )).resolves.toBe('conflict');
  });

  it('uses SDK inspection to classify legacy encryption metadata as an upgrade', async () => {
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
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: legacyInstalled } }],
      },
    });

    expect(protocolDefinitionsMatch(legacyInstalled, encryptedProtocol)).toBe(true);
    await expect(queryProtocolSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      encryptedProtocol,
    )).resolves.toBe('upgrade');
  });

  it('rejects a spoofed definition for a wallet-pinned protocol URI', () => {
    const spoofedProfile = {
      ...ProfileDefinition,
      types: {
        ...ProfileDefinition.types,
        profile: { schema: 'https://evil.example/profile' },
      },
    } as DwnProtocolDefinition;

    expect(getRequestedProtocolDefinitionsConflictMessage([
      ProfileDefinition as DwnProtocolDefinition,
    ])).toBeUndefined();
    expect(getRequestedProtocolDefinitionsConflictMessage([spoofedProfile])).toMatch(
      /does not match the wallet's pinned canonical definition/,
    );

    const nonNormalizedSpoof = {
      ...spoofedProfile,
      protocol: 'HTTPS://identity.foundation/protocols/profile',
    } as DwnProtocolDefinition;
    expect(getRequestedProtocolDefinitionsConflictMessage([nonNormalizedSpoof])).toMatch(
      /is not normalized/,
    );
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
