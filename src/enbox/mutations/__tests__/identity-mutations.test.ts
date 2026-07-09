import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import {
  createIdentity,
  importIdentity,
  importValidatedIdentity,
  updateDwnEndpoints,
  updateIdentityProfile,
} from '../identity-mutations';

const mocks = vi.hoisted(() => {
  const calls: string[] = [];
  const connectProtocol = Symbol('ConnectProtocol');

  const profileRecord = { contextId: 'profile-context' };
  const walletRecord = {};
  const profileRepo = {
    profile: {
      set: vi.fn(async () => {
        calls.push('profile:set');
        return { record: profileRecord };
      }),
      avatar: {
        set: vi.fn(async () => ({})),
        get: vi.fn(async () => undefined),
      },
      hero: {
        set: vi.fn(async () => ({})),
        get: vi.fn(async () => undefined),
      },
    },
  };
  const connectApi = {
    records: {
      query: vi.fn(async () => ({ records: [] })),
      create: vi.fn(async () => {
        calls.push('wallet:create');
        return { record: walletRecord };
      }),
    },
  };

  return {
    calls,
    connectProtocol,
    connectApi,
    profileRepo,
    profileRecord,
    walletRecord,
    Enbox: vi.fn().mockImplementation(function Enbox() {
      return {
      using: vi.fn((protocol) => protocol === connectProtocol ? connectApi : protocol),
      };
    }),
    repository: vi.fn(() => profileRepo),
    ensureRegistration: vi.fn(),
    ensurePortableOwnerPublished: vi.fn(),
    installProtocols: vi.fn(),
    validatePortableOwnerIdentity: vi.fn(),
  };
});

vi.mock('@enbox/api', () => ({
  Enbox: mocks.Enbox,
  repository: mocks.repository,
}));

vi.mock('@enbox/protocols', () => ({
  ProfileProtocol: Symbol('ProfileProtocol'),
  ConnectProtocol: mocks.connectProtocol,
  SocialGraphDefinition: { protocol: 'https://identity.foundation/protocols/social-graph' },
  ProfileDefinition: { protocol: 'https://identity.foundation/protocols/profile' },
  ConnectDefinition: { protocol: 'https://identity.foundation/protocols/connect' },
}));

vi.mock('../../protocols', async () => {
  const effect = await vi.importActual<typeof import('effect')>('effect');

  mocks.installProtocols.mockImplementation(() =>
    effect.Effect.sync(() => {
      mocks.calls.push('protocols:install');
    })
  );

  return {
    IDENTITY_SYNC_PROTOCOLS : [
      'https://identity.foundation/protocols/social-graph',
      'https://identity.foundation/protocols/profile',
      'https://identity.foundation/protocols/connect',
    ],
    installProtocolsEffect : mocks.installProtocols,
  };
});

vi.mock('../../registration', async () => {
  const effect = await vi.importActual<typeof import('effect')>('effect');

  mocks.ensureRegistration.mockImplementation(() =>
    effect.Effect.sync(() => {
      mocks.calls.push('registration:ensure');
    })
  );

  return {
    ensureRegistrationEffect: mocks.ensureRegistration,
  };
});

vi.mock('@/lib/dwn-endpoints', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/dwn-endpoints')>(),
  WALLET_URL: 'https://wallet.example',
}));

vi.mock('@/features/connect/portable-owner-identity', () => ({
  ensurePortableOwnerPublished: mocks.ensurePortableOwnerPublished,
  portableOwnerDocumentsMatch: (left: unknown, right: unknown) =>
    JSON.stringify(left) === JSON.stringify(right),
  validatePortableOwnerIdentity: mocks.validatePortableOwnerIdentity,
}));

function createAgent(did = 'did:dht:new', didMetadata?: Record<string, unknown>) {
  return {
    agentDid: { uri: 'did:dht:agent' },
    identity: {
      create: vi.fn(async () => {
        mocks.calls.push('identity:create');
        return { did: { uri: did, metadata: didMetadata } };
      }),
      get: vi.fn(async () => undefined),
      import: vi.fn(async () => {
        mocks.calls.push('identity:import');
        return { did: { uri: did, metadata: didMetadata } };
      }),
      setMetadataName: vi.fn(async () => { mocks.calls.push('identity:setMetadataName'); }),
      setDwnEndpoints: vi.fn(async () => { mocks.calls.push('identity:setDwnEndpoints'); }),
      delete: vi.fn(async () => { mocks.calls.push('identity:delete'); }),
    },
    did: {
      delete: vi.fn(async () => { mocks.calls.push('did:delete'); }),
    },
    dwn: {
      getRemoteDwnEndpointUrls: vi.fn(async () => ['https://imported.example/dwn']),
    },
    sync: {
      getIdentityOptions: vi.fn(async () => ({
        protocols: ['https://identity.foundation/protocols/profile'],
      })),
      registerIdentity: vi.fn(async () => { mocks.calls.push('sync:register'); }),
      updateIdentityOptions: vi.fn(async () => { mocks.calls.push('sync:update'); }),
      unregisterIdentity: vi.fn(async () => { mocks.calls.push('sync:unregister'); }),
    },
  };
}

describe('identity mutations', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    vi.clearAllMocks();
    mocks.ensurePortableOwnerPublished.mockResolvedValue(undefined);
    mocks.validatePortableOwnerIdentity.mockImplementation(async (portableIdentity: any) => ({
      did: portableIdentity.portableDid.uri,
      dwnEndpoints: ['https://imported.example/dwn'],
      portableIdentity,
    }));
  });

  it('installs protocols locally before live sync and profile writes', async () => {
    const did = 'did:dht:new';
    const dwnEndpoints = ['https://aws.example/dwn', 'https://fly.example/dwn'];
    const agent = createAgent(did);

    await createIdentity(agent, {
      persona: 'Personal',
      displayName: 'Alice',
      dwnEndpoints,
    });

    expect(mocks.installProtocols).toHaveBeenCalledWith(did);
    expect(mocks.ensureRegistration).toHaveBeenCalledWith(dwnEndpoints, [did]);
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did,
      options: {
        protocols: [
          'https://identity.foundation/protocols/social-graph',
          'https://identity.foundation/protocols/profile',
          'https://identity.foundation/protocols/connect',
        ],
      },
    });
    expect(mocks.calls).toEqual([
      'identity:create',
      'registration:ensure',
      'protocols:install',
      'sync:register',
      'profile:set',
      'wallet:create',
    ]);
  });

  it('aborts and cleans up the local identity if the DHT publish failed', async () => {
    const did = 'did:dht:unpublished';
    const agent = createAgent(did, { published: false });

    await expect(createIdentity(agent, {
      persona: 'Personal',
      displayName: 'Alice',
      dwnEndpoints: ['https://fly.example/dwn'],
    })).rejects.toThrow(`Failed to publish DID ${did}`);

    expect(mocks.ensureRegistration).not.toHaveBeenCalled();
    expect(mocks.installProtocols).not.toHaveBeenCalled();
    expect(agent.identity.delete).toHaveBeenCalledWith({ didUri: did });
    expect(agent.did.delete).toHaveBeenCalledWith({ didUri: did, tenant: 'did:dht:agent' });
  });

  it('cleans up the local identity when required protocol bootstrap fails', async () => {
    const did = 'did:dht:failed-bootstrap';
    const agent = createAgent(did);
    mocks.installProtocols.mockImplementationOnce(() =>
      Effect.fail(new Error('bootstrap failed'))
    );

    await expect(createIdentity(agent, {
      persona: 'Personal',
      displayName: 'Alice',
      dwnEndpoints: ['https://fly.example/dwn'],
    })).rejects.toThrow('bootstrap failed');

    expect(agent.sync.registerIdentity).not.toHaveBeenCalled();
    expect(mocks.profileRepo.profile.set).not.toHaveBeenCalled();
    expect(agent.identity.delete).toHaveBeenCalledWith({ didUri: did });
    expect(agent.did.delete).toHaveBeenCalledWith({ didUri: did, tenant: 'did:dht:agent' });
  });

  it('uses the same local protocol-before-sync setup when importing an identity', async () => {
    const did = 'did:dht:imported';
    const agent = createAgent(did);

    await importIdentity(agent, { portableDid: { uri: did } });

    expect(mocks.installProtocols).toHaveBeenCalledWith(did);
    expect(mocks.ensurePortableOwnerPublished).not.toHaveBeenCalled();
    expect(mocks.ensureRegistration).toHaveBeenCalledWith(
      ['https://imported.example/dwn'],
      [did],
    );
    expect(agent.sync.registerIdentity).toHaveBeenCalledWith({
      did,
      options: {
        protocols: [
          'https://identity.foundation/protocols/social-graph',
          'https://identity.foundation/protocols/profile',
          'https://identity.foundation/protocols/connect',
        ],
      },
    });
    expect(mocks.calls).toEqual([
      'identity:import',
      'registration:ensure',
      'protocols:install',
      'sync:register',
      'wallet:create',
    ]);
  });

  it('keeps ordinary duplicate file imports rejected', async () => {
    const did = 'did:dht:imported';
    const agent = createAgent(did);
    agent.identity.get.mockResolvedValue({ did: { uri: did } });

    await expect(importIdentity(agent, {
      portableDid: { uri: did, document: { id: did } },
    })).rejects.toThrow('Identity already exists');

    expect(mocks.ensurePortableOwnerPublished).not.toHaveBeenCalled();
    expect(agent.identity.import).not.toHaveBeenCalled();
  });

  it('resumes an explicitly idempotent portable-owner import without importing keys twice', async () => {
    const did = 'did:dht:imported';
    const agent = createAgent(did);
    const existingIdentity = {
      did: { uri: did },
      export: vi.fn(async () => ({ portableDid: { uri: did, document: { id: did } } })),
    };
    agent.identity.get.mockResolvedValue(existingIdentity);

    const portableIdentity = { portableDid: { uri: did, document: { id: did } } } as any;
    const result = await importValidatedIdentity(agent, {
      did,
      dwnEndpoints: ['https://imported.example/dwn'],
      portableIdentity,
    }, { allowExistingExact: true, ensurePublished: true });

    expect(result).toBe(existingIdentity);
    expect(mocks.ensurePortableOwnerPublished).toHaveBeenCalledOnce();
    expect(agent.identity.import).not.toHaveBeenCalled();
    expect(mocks.ensureRegistration).toHaveBeenCalledWith(
      ['https://imported.example/dwn'],
      [did],
    );
    expect(mocks.installProtocols).toHaveBeenCalledWith(did);
    expect(agent.sync.registerIdentity).toHaveBeenCalledOnce();
  });

  it('rejects a portable-owner import when the existing DID document differs', async () => {
    const did = 'did:dht:imported';
    const agent = createAgent(did);
    agent.identity.get.mockResolvedValue({
      did: { uri: did },
      export: vi.fn(async () => ({ portableDid: { uri: did, document: { id: did, version: 1 } } })),
    });

    await expect(importIdentity(agent, {
      portableDid: { uri: did, document: { id: did, version: 2 } },
    })).rejects.toThrow('Identity already exists');

    expect(mocks.ensurePortableOwnerPublished).not.toHaveBeenCalled();
    expect(agent.identity.import).not.toHaveBeenCalled();
  });

  it('normalizes uploaded profile image Files to typed Blobs', async () => {
    const did = 'did:dht:new';
    const agent = createAgent(did);
    const avatar = new File(['avatar'], 'avatar.jpg', { type: 'image/jpeg' });

    await createIdentity(agent, {
      persona: 'Personal',
      displayName: 'Alice',
      avatar,
      dwnEndpoints: ['https://fly.example/dwn'],
    });

    expect(mocks.profileRepo.profile.avatar.set).toHaveBeenCalledWith(
      'profile-context',
      expect.objectContaining({
        dataFormat: 'image/jpeg',
      }),
    );

    const avatarWrite = mocks.profileRepo.profile.avatar.set.mock.calls[0][1];
    expect(avatarWrite.data).toBeInstanceOf(Blob);
    expect(avatarWrite.data).not.toBeInstanceOf(File);
    expect(avatarWrite.data.type).toBe('image/jpeg');
  });

  it('registers only the edited identity before applying its endpoint list', async () => {
    const did = 'did:dht:existing';
    const agent = createAgent(did);

    await updateDwnEndpoints(agent, {
      did,
      endpoints: ['https://DWN.example/path/'],
    });

    expect(agent.identity.setDwnEndpoints).toHaveBeenCalledWith({
      didUri: did,
      endpoints: ['https://dwn.example/path'],
    });
    expect(mocks.ensureRegistration).toHaveBeenCalledWith(
      ['https://dwn.example/path'],
      [did],
    );
    expect(agent.sync.updateIdentityOptions).toHaveBeenCalledWith({
      did,
      options: { protocols: ['https://identity.foundation/protocols/profile'] },
    });
    expect(mocks.calls).toEqual([
      'registration:ensure',
      'identity:setDwnEndpoints',
      'sync:update',
    ]);
  });

  it('does not publish endpoint changes when tenant registration fails', async () => {
    const did = 'did:dht:existing';
    const agent = createAgent(did);
    mocks.ensureRegistration.mockImplementationOnce(() =>
      Effect.fail(new Error('registration failed'))
    );

    await expect(updateDwnEndpoints(agent, {
      did,
      endpoints: ['https://unavailable.example/dwn'],
    })).rejects.toThrow('registration failed');

    expect(agent.identity.setDwnEndpoints).not.toHaveBeenCalled();
  });

  it('replaces profile image records so the MIME type can change', async () => {
    const did = 'did:dht:existing';
    const agent = createAgent(did);
    const existingAvatar = { delete: vi.fn(async () => undefined) };
    const avatar = new File(['avatar'], 'avatar.webp', { type: 'image/webp' });
    mocks.profileRepo.profile.avatar.get.mockResolvedValueOnce(existingAvatar);

    await updateIdentityProfile(agent, {
      did,
      displayName: 'Alice',
      avatar,
    });

    expect(mocks.profileRepo.profile.avatar.get).toHaveBeenCalledWith('profile-context');
    expect(existingAvatar.delete).toHaveBeenCalled();
    expect(mocks.profileRepo.profile.avatar.set).toHaveBeenCalledWith(
      'profile-context',
      expect.objectContaining({
        dataFormat: 'image/webp',
      }),
    );
  });

  it('rejects unsupported profile image types with a supported-format message', async () => {
    const did = 'did:dht:existing';
    const agent = createAgent(did);
    const avatar = new File(['avatar'], 'avatar.svg', { type: 'image/svg+xml' });

    await expect(updateIdentityProfile(agent, {
      did,
      displayName: 'Alice',
      avatar,
    })).rejects.toThrow('Avatar image must be a PNG, JPEG, GIF, or WebP image.');

    expect(mocks.profileRepo.profile.avatar.set).not.toHaveBeenCalled();
  });
});
