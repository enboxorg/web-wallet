import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── Hoisted mocks ────────────────────────────────────────────────────────

const {
  mockAgent,
  mockListIdentities,
  mockIdentityCreate,
  mockIdentityGet,
  mockIdentityDelete,
  mockSyncRegisterIdentity,
  mockSyncUnregisterIdentity,
  mockSyncStartSync,
  mockSyncStopSync,
  mockConfigureProtocol,
  mockListProtocols,
  mockListPermissions,
  mockListRecentRecords,
  mockGetSocial,
  mockGetAvatar,
  mockGetHero,
  mockSetSocial,
  mockSetAvatar,
  mockSetHero,
} = vi.hoisted(() => {
  const mockListIdentities = vi.fn().mockResolvedValue([]);
  const mockIdentityCreate = vi.fn();
  const mockIdentityGet = vi.fn();
  const mockIdentityDelete = vi.fn();
  const mockSyncRegisterIdentity = vi.fn().mockResolvedValue(undefined);
  const mockSyncUnregisterIdentity = vi.fn().mockResolvedValue(undefined);
  const mockSyncStartSync = vi.fn();
  const mockSyncStopSync = vi.fn().mockResolvedValue(undefined);
  const mockConfigureProtocol = vi.fn().mockResolvedValue(null);
  const mockListProtocols = vi.fn().mockResolvedValue([]);
  const mockListPermissions = vi.fn().mockResolvedValue([]);
  const mockListRecentRecords = vi.fn().mockResolvedValue([]);
  const mockGetSocial = vi.fn();
  const mockGetAvatar = vi.fn();
  const mockGetHero = vi.fn();
  const mockSetSocial = vi.fn().mockResolvedValue({});
  const mockSetAvatar = vi.fn().mockResolvedValue({});
  const mockSetHero = vi.fn().mockResolvedValue({});

  const mockAgent = {
    identity: {
      list            : mockListIdentities,
      create          : mockIdentityCreate,
      get             : mockIdentityGet,
      delete          : mockIdentityDelete,
      setMetadataName : vi.fn(),
      setDwnEndpoints : vi.fn(),
      import          : vi.fn(),
    },
    did: { delete: vi.fn(), resolve: vi.fn() },
    agentDid: { uri: 'did:dht:agent123' },
    sync: {
      registerIdentity   : mockSyncRegisterIdentity,
      unregisterIdentity : mockSyncUnregisterIdentity,
      sync               : vi.fn().mockResolvedValue(undefined),
      startSync          : mockSyncStartSync,
      stopSync           : mockSyncStopSync,
    },
    rpc: {
      getServerInfo: vi.fn().mockResolvedValue({
        registrationRequirements : [],
        maxFileSize              : 100_000_000,
        server                   : 'dwn-server',
        sdkVersion               : '1.0',
        url                      : 'https://dwn.example.com',
        version                  : '1.0',
        webSocketSupport         : true,
      }),
    },
  };

  return {
    mockAgent,
    mockListIdentities,
    mockIdentityCreate,
    mockIdentityGet,
    mockIdentityDelete,
    mockSyncRegisterIdentity,
    mockSyncUnregisterIdentity,
    mockSyncStartSync,
    mockSyncStopSync,
    mockConfigureProtocol,
    mockListProtocols,
    mockListPermissions,
    mockListRecentRecords,
    mockGetSocial,
    mockGetAvatar,
    mockGetHero,
    mockSetSocial,
    mockSetAvatar,
    mockSetHero,
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────

vi.mock('./Context', () => ({
  useAgent: vi.fn().mockImplementation(() => ({ agent: mockAgent })),
}));

vi.mock('@/lib/Web5Helper', () => ({
  default: vi.fn().mockImplementation(() => ({
    web5: {
      using: vi.fn().mockReturnValue({
        records: {
          query  : vi.fn().mockResolvedValue({ records: [] }),
          create : vi.fn().mockResolvedValue({
            status : { code: 202 },
            record : { send: vi.fn().mockResolvedValue({ status: { code: 202 } }) },
          }),
        },
      }),
    },
    listProtocols     : mockListProtocols,
    listPermissions   : mockListPermissions,
    listRecentRecords : mockListRecentRecords,
    configureProtocol : mockConfigureProtocol,
  })),
}));

vi.mock('@/lib/ProfileProtocol', () => ({
  default: vi.fn().mockImplementation(() => ({
    getSocial : mockGetSocial,
    getAvatar : mockGetAvatar,
    getHero   : mockGetHero,
    setSocial : mockSetSocial,
    setAvatar : mockSetAvatar,
    setHero   : mockSetHero,
  })),
  ConnectDefinition : { protocol: 'https://protocols/connect' },
  ProfileDefinition : { protocol: 'https://protocols/profile' },
}));

vi.mock('@enbox/protocols', () => ({
  ConnectProtocol       : 'ConnectProtocolMock',
  SocialGraphDefinition : { protocol: 'https://protocols/social-graph' },
}));

vi.mock('@enbox/agent', () => ({
  getDwnServiceEndpointUrls: vi.fn().mockResolvedValue(['https://dwn.example.com']),
}));

vi.mock('@enbox/api', () => {
  function MockWeb5() {
    return {
      using: vi.fn().mockReturnValue({
        records: {
          query  : vi.fn().mockResolvedValue({ records: [] }),
          create : vi.fn().mockResolvedValue({
            status : { code: 202 },
            record : { send: vi.fn() },
          }),
        },
      }),
    };
  }
  return {
    PermissionGrant : class {},
    Web5            : MockWeb5,
    Record          : class {},
    LiveQuery       : class {},
  };
});

vi.mock('@enbox/api/advanced', () => {
  function MockDwnApi() {
    return {
      records: {
        subscribe: vi.fn().mockResolvedValue({ liveQuery: undefined }),
      },
    };
  }
  return { DwnApi: MockDwnApi };
});

vi.mock('@/lib/registration', () => ({
  getStoredTokens         : vi.fn().mockReturnValue({}),
  storeTokens             : vi.fn(),
  registerDidWithEndpoint : vi.fn().mockResolvedValue({}),
}));

import { IdentitiesContext, IdentitiesProvider } from './IdentitiesContext';

// ── Consumer ─────────────────────────────────────────────────────────────

const IdentitiesConsumer: React.FC = () => {
  const ctx = React.useContext(IdentitiesContext);
  if (!ctx) return <div data-testid="no-context">No context</div>;

  return (
    <div>
      <span data-testid="identity-count">{ctx.identities.length}</span>
      <span data-testid="protocols-count">{ctx.protocols.length}</span>
      <span data-testid="activities-count">{ctx.activities.length}</span>
      <span data-testid="selected-identity">{ctx.selectedIdentity?.didUri ?? 'none'}</span>
      <button
        data-testid="create-btn"
        onClick={() => ctx.createIdentity({
          persona      : 'Alice',
          displayName  : 'Alice Wonderland',
          tagline      : 'Curious',
          bio          : 'Down the rabbit hole',
          walletHost   : 'https://wallet.example.com',
          dwnEndpoints : ['https://dwn.example.com'],
        })}
      >
        Create
      </button>
      <button
        data-testid="delete-btn"
        onClick={() => ctx.deleteIdentity('did:dht:delete-me')}
      >
        Delete
      </button>
      <button
        data-testid="select-btn"
        onClick={() => ctx.selectIdentity('did:dht:alice123')}
      >
        Select
      </button>
    </div>
  );
};

describe('IdentitiesContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetSocial.mockResolvedValue(undefined);
    mockGetAvatar.mockResolvedValue(undefined);
    mockGetHero.mockResolvedValue(undefined);
    mockListIdentities.mockResolvedValue([]);
  });

  it('should provide context to children', async () => {
    render(
      <IdentitiesProvider>
        <IdentitiesConsumer />
      </IdentitiesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('identity-count')).toHaveTextContent('0');
    });
  });

  it('should load identities on mount', async () => {
    const mockBearerIdentity = {
      did      : { uri: 'did:dht:alice123' },
      metadata : { name: 'Alice' },
    };
    mockListIdentities.mockResolvedValue([mockBearerIdentity]);

    render(
      <IdentitiesProvider>
        <IdentitiesConsumer />
      </IdentitiesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('identity-count')).toHaveTextContent('1');
    });
  });

  it('should create an identity', async () => {
    const createdIdentity = {
      did      : { uri: 'did:dht:newalice' },
      metadata : { name: 'Alice' },
    };
    mockIdentityCreate.mockResolvedValue(createdIdentity);

    render(
      <IdentitiesProvider>
        <IdentitiesConsumer />
      </IdentitiesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-btn')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTestId('create-btn').click();
    });

    expect(mockIdentityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        store     : true,
        didMethod : 'dht',
        metadata  : { name: 'Alice' },
      }),
    );

    // Should configure protocols (SocialGraph, Profile, Connect)
    expect(mockConfigureProtocol).toHaveBeenCalledTimes(3);

    // Should set social data
    expect(mockSetSocial).toHaveBeenCalledWith({
      displayName : 'Alice Wonderland',
      tagline     : 'Curious',
      bio         : 'Down the rabbit hole',
      apps        : {},
    });

    // Should restart sync in live mode
    expect(mockSyncStartSync).toHaveBeenCalledWith({ mode: 'live', interval: '5m' });
  });

  it('should delete an identity', async () => {
    const identity = {
      did      : { uri: 'did:dht:delete-me' },
      metadata : { name: 'ToDelete' },
      export   : vi.fn(),
    };
    mockIdentityGet.mockResolvedValue(identity);
    mockIdentityDelete.mockResolvedValue(undefined);

    render(
      <IdentitiesProvider>
        <IdentitiesConsumer />
      </IdentitiesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('delete-btn')).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByTestId('delete-btn').click();
    });

    expect(mockIdentityGet).toHaveBeenCalledWith({ didUri: 'did:dht:delete-me' });
    expect(mockSyncUnregisterIdentity).toHaveBeenCalledWith('did:dht:delete-me');
    expect(mockIdentityDelete).toHaveBeenCalledWith({ didUri: 'did:dht:delete-me' });
  });

  it('should select an identity', async () => {
    const mockBearerIdentity = {
      did      : { uri: 'did:dht:alice123' },
      metadata : { name: 'Alice' },
    };
    mockListIdentities.mockResolvedValue([mockBearerIdentity]);

    render(
      <IdentitiesProvider>
        <IdentitiesConsumer />
      </IdentitiesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('identity-count')).toHaveTextContent('1');
    });

    await act(async () => {
      screen.getByTestId('select-btn').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('selected-identity')).toHaveTextContent('did:dht:alice123');
    });
  });

  it('should return null context when used without provider', () => {
    render(<IdentitiesConsumer />);
    expect(screen.getByTestId('no-context')).toBeInTheDocument();
  });
});
