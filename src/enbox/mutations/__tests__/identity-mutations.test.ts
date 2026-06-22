import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Effect } from 'effect';

import { createIdentity, importIdentity, updateIdentityProfile } from '../identity-mutations';

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
    installProtocols: vi.fn(),
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

vi.mock('@/lib/dwn-endpoints', () => ({
  DEFAULT_DWN_ENDPOINTS: ['https://aws.example/dwn', 'https://fly.example/dwn'],
  WALLET_URL: 'https://wallet.example',
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
      delete: vi.fn(async () => { mocks.calls.push('identity:delete'); }),
    },
    did: {
      delete: vi.fn(async () => { mocks.calls.push('did:delete'); }),
    },
    sync: {
      registerIdentity: vi.fn(async () => { mocks.calls.push('sync:register'); }),
      unregisterIdentity: vi.fn(async () => { mocks.calls.push('sync:unregister'); }),
    },
  };
}

describe('identity mutations', () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    vi.clearAllMocks();
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
