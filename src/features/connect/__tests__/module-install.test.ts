import { describe, expect, it, vi } from 'vitest';
import type { DwnModuleDefinition } from '@enbox/agent';
import { KeyDerivationScheme } from '@enbox/dwn-sdk-js';
import { ProfileDefinition } from '@enbox/modules';

import {
  getRequestedModuleDefinitionsConflictMessage,
  moduleDefinitionsMatch,
  queryModuleSetupStatus,
} from '../module-install';

function createDwn() {
  const keysByPath = new Map([
    [JSON.stringify([KeyDerivationScheme.ModulePath, encryptedModule.module]), 'module-key'],
    [JSON.stringify([KeyDerivationScheme.ModulePath, encryptedModule.module, 'mint']), 'mint-key'],
    [JSON.stringify([KeyDerivationScheme.ModulePath, encryptedModule.module, 'mint', 'proof']), 'proof-key'],
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

const encryptedModule: DwnModuleDefinition = {
  module: 'https://example.com/modules/demo',
  published: false,
  types: {
    mint: { schema: 'https://example.com/schemas/mint' },
    proof: { schema: 'https://example.com/schemas/proof', encryptionRequired: true },
  },
  structure: {
    mint: {
      proof: {
        },
    },
  },
};

const installedEncryptedModule: DwnModuleDefinition = {
  ...encryptedModule,
  $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'module-key' } },
  structure: {
    mint: {
      $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'mint-key' } },
      proof: {
          $keyAgreement: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'proof-key' } },
      },
    },
  },
};

const notesModule: DwnModuleDefinition = {
  module: 'https://example.com/modules/notes',
  published: false,
  types: {
    note: { schema: 'https://example.com/schemas/note' },
  },
  structure: {
    note: {
    },
  },
};

describe('module-install', () => {
  it('treats generated encryption metadata as compatible with the requested definition', () => {
    expect(moduleDefinitionsMatch(installedEncryptedModule, encryptedModule)).toBe(true);
  });

  it('reads installed definitions from ModulesConfigure query entries', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: installedEncryptedModule } }],
      },
    });

    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      encryptedModule,
    )).resolves.toBe('configured');
  });

  it('reports an absent module as requiring installation', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [],
      },
    });

    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      notesModule,
    )).resolves.toBe('install');
  });

  it('verifies installed encryption keys against every complete owner derivation path', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: installedEncryptedModule } }],
      },
    });
    const dwn = createDwn();

    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn, processDwnRequest },
      encryptedModule,
    )).resolves.toBe('configured');

    const keyDeriver = await dwn.getEncryptionKeyDeriver.mock.results[0].value;
    expect(keyDeriver.derivePublicKey.mock.calls).toEqual([
      [[KeyDerivationScheme.ModulePath, encryptedModule.module]],
      [[KeyDerivationScheme.ModulePath, encryptedModule.module, 'mint']],
      [[KeyDerivationScheme.ModulePath, encryptedModule.module, 'mint', 'proof']],
    ]);
  });

  it('maps an SDK definition conflict for a custom module to an explicit override', async () => {
    const olderInstalledDefinition: DwnModuleDefinition = {
      ...notesModule,
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

    expect(moduleDefinitionsMatch(olderInstalledDefinition, notesModule)).toBe(false);
    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      notesModule,
    )).resolves.toBe('override');
  });

  it('keeps an SDK definition conflict for a canonical module hard-blocked', async () => {
    const legacyInstalledProfile = {
      ...ProfileDefinition,
      types: {
        ...ProfileDefinition.types,
        profile: { schema: 'https://legacy.example/profile' },
      },
    } as DwnModuleDefinition;
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: legacyInstalledProfile } }],
      },
    });

    // The requested definition IS the canonical pin; only the installed one
    // differs. Canonical wallet modules are never overridable via a connection.
    expect(moduleDefinitionsMatch(legacyInstalledProfile, ProfileDefinition as DwnModuleDefinition)).toBe(false);
    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      ProfileDefinition as DwnModuleDefinition,
    )).resolves.toBe('conflict');
  });

  it('uses SDK inspection to classify legacy encryption metadata as an upgrade', async () => {
    const legacyInstalled = {
      ...encryptedModule,
      structure: {
        mint: {
              proof: {
                  $encryption: { publicKeyJwk: { kty: 'OKP', crv: 'X25519', x: 'legacy-key' } },
          },
        },
      },
    } as DwnModuleDefinition;
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: legacyInstalled } }],
      },
    });

    expect(moduleDefinitionsMatch(legacyInstalled, encryptedModule)).toBe(true);
    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn: createDwn(), processDwnRequest },
      encryptedModule,
    )).resolves.toBe('upgrade');
  });

  it('requires owner-derived keys for plaintext role providers', async () => {
    const definition: DwnModuleDefinition = {
      module: 'https://example.com/modules/roles', published: false,
      types: { member: {} }, structure: { member: { $role: true } },
    };
    const processDwnRequest = vi.fn().mockResolvedValue({ reply: {
      status: { code: 200, detail: 'OK' }, entries: [{ descriptor: { definition } }],
    } });
    const dwn = createDwn();
    await expect(queryModuleSetupStatus('did:example:owner', { dwn, processDwnRequest }, definition)).resolves.toBe('upgrade');

    const key = { publicKeyJwk: { kty: 'OKP' as const, crv: 'X25519' as const, x: 'unexpected-path-key' } };
    const installed = { ...definition, $keyAgreement: key, structure: { member: { $role: true, $keyAgreement: key } } };
    processDwnRequest.mockResolvedValue({ reply: {
      status: { code: 200, detail: 'OK' }, entries: [{ descriptor: { definition: installed } }],
    } });
    await expect(queryModuleSetupStatus('did:example:owner', { dwn, processDwnRequest }, definition)).resolves.toBe('configured');
    installed.structure.member.$keyAgreement = { publicKeyJwk: { ...key.publicKeyJwk, x: 'another-owner' } };
    await expect(queryModuleSetupStatus('did:example:owner', { dwn, processDwnRequest }, definition)).resolves.toBe('conflict');
  });

  it('reuses an installed implicit provider with additional dependencies while preserving explicit override policy', async () => {
    const installed: DwnModuleDefinition = {
      ...encryptedModule,
      ...installedEncryptedModule,
      uses: { extra: 'https://example.com/modules/new-provider' },
    };
    const processDwnRequest = vi.fn().mockResolvedValue({ reply: {
      status: { code: 200, detail: 'OK' }, entries: [{ descriptor: { definition: installed } }],
    } });
    const agent = { dwn: createDwn(), processDwnRequest };
    await expect(queryModuleSetupStatus('did:example:owner', agent, encryptedModule, { reuseInstalledDefinition: true }))
      .resolves.toBe('configured');
    await expect(queryModuleSetupStatus('did:example:owner', agent, encryptedModule)).resolves.toBe('override');
    expect(installed).toHaveProperty('uses.extra', 'https://example.com/modules/new-provider');
    expect(processDwnRequest.mock.calls.every(([request]) => request.messageType === 'ModulesQuery')).toBe(true);
  });

  it('rejects a spoofed definition for a wallet-pinned module URI', () => {
    const spoofedProfile = {
      ...ProfileDefinition,
      types: {
        ...ProfileDefinition.types,
        profile: { schema: 'https://evil.example/profile' },
      },
    } as DwnModuleDefinition;

    expect(getRequestedModuleDefinitionsConflictMessage([
      ProfileDefinition as DwnModuleDefinition,
    ])).toBeUndefined();
    expect(getRequestedModuleDefinitionsConflictMessage([spoofedProfile])).toMatch(
      /does not match the wallet's pinned canonical definition/,
    );

    const nonNormalizedSpoof = {
      ...spoofedProfile,
      module: 'HTTPS://identity.foundation/modules/profile',
    } as DwnModuleDefinition;
    expect(getRequestedModuleDefinitionsConflictMessage([nonNormalizedSpoof])).toMatch(
      /is not normalized/,
    );
  });

  it('rejects installed encryption keys that are not derived from the wallet owner', async () => {
    const processDwnRequest = vi.fn().mockResolvedValue({
      reply: {
        status  : { code: 200, detail: 'OK' },
        entries : [{ descriptor: { definition: installedEncryptedModule } }],
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

    await expect(queryModuleSetupStatus(
      'did:example:owner',
      { dwn, processDwnRequest },
      encryptedModule,
    )).resolves.toBe('conflict');
  });

});
