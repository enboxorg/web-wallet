import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDWebConnectStore, type DWebConnectRequest } from '@/stores/dweb-connect-store';
import DWebConnectPage from '../DWebConnectPage';

const mocks = vi.hoisted(() => ({
  agent: {
    id: 'agent-1',
    dwn: {
      getRemoteDwnEndpointUrls: vi.fn(),
    },
    rpc: {
      getServerInfo: vi.fn(),
    },
  },
  createAndSendGrantKeyRecords: vi.fn(),
  createDelegateDid: vi.fn(),
  createPermissionGrants: vi.fn(),
  createSessionRevocationGrants: vi.fn(),
  encryptDWebConnectResponse: vi.fn(),
  ensureRegistrationForDids: vi.fn(),
  importValidatedIdentity: vi.fn(),
  validatePortableOwnerIdentity: vi.fn(),
  prepareProtocol: vi.fn(),
  queryProtocolSetupStatus: vi.fn(),
  publishWalletEvent: vi.fn(),
  permissions: [] as any[],
  identities: [
    {
      did: { uri: 'did:dht:alice' },
      metadata: { name: 'Alice' },
    },
  ] as any[],
  identitiesLoading: false,
}));

vi.mock('@/enbox/hooks/use-agent', () => ({
  useAgent: () => mocks.agent,
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data      : mocks.identities,
    isLoading : mocks.identitiesLoading,
  }),
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: (did: string) => ({
    data      : did ? mocks.permissions : [],
    isLoading : false,
    isError   : false,
  }),
}));

vi.mock('@/enbox/registration', () => ({
  ensureRegistrationForDids: mocks.ensureRegistrationForDids,
}));

vi.mock('@/enbox/effect/wallet-events', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/enbox/effect/wallet-events')>(),
  publishWalletEvent: mocks.publishWalletEvent,
}));

vi.mock('@/enbox/mutations/identity-mutations', () => ({
  importValidatedIdentity: mocks.importValidatedIdentity,
}));

vi.mock('../connect-effects', async (importOriginal) => ({
  ...await importOriginal<typeof import('../connect-effects')>(),
  createAndSendGrantKeyRecords: mocks.createAndSendGrantKeyRecords,
  createDelegateDid: mocks.createDelegateDid,
  createPermissionGrants: mocks.createPermissionGrants,
  createSessionRevocationGrants: mocks.createSessionRevocationGrants,
  encryptDWebConnectResponse: mocks.encryptDWebConnectResponse,
}));

vi.mock('../protocol-install', async (importOriginal) => ({
  ...await importOriginal<typeof import('../protocol-install')>(),
  prepareProtocol: mocks.prepareProtocol,
  queryProtocolSetupStatus: mocks.queryProtocolSetupStatus,
}));

vi.mock('../portable-owner-identity', () => ({
  validatePortableOwnerIdentity: mocks.validatePortableOwnerIdentity,
}));

const EPHEMERAL_PUBLIC_KEY = 'BD9WY6815Q2-il2LQsSmn0XqWzkCtWClUfHQ5gStlg5xBKyBlwPlNDXXASI1ZWBtZAvYHj2pRKKZF_6e_RCHdKI';

const permissionRequest = {
  protocolDefinition: {
    protocol  : 'https://example.com/protocols/tasks',
    published : false,
    types     : {
      task: {
        schema             : 'https://example.com/protocols/tasks/schema/task',
        dataFormats        : ['application/json'],
        encryptionRequired : true,
      },
    },
    structure : { task: {} },
  },
  permissionScopes: [
    {
      interface: 'Records',
      method: 'Read',
      protocol: 'https://example.com/protocols/tasks',
    },
  ],
};

const secondPermissionRequest = {
  protocolDefinition: {
    protocol  : 'https://example.com/protocols/profile',
    published : false,
    types     : {},
    structure : {},
  },
  permissionScopes: [
    {
      interface: 'Records',
      method: 'Read',
      protocol: 'https://example.com/protocols/profile',
    },
    {
      interface: 'Records',
      method: 'Write',
      protocol: 'https://example.com/protocols/profile',
    },
  ],
};

function connectRequest(): DWebConnectRequest {
  return {
    origin: 'https://app.example',
    timestamp: 1,
    data: {
      type: 'dweb-connect-authorization-request',
      appName: 'Example App',
      ephemeralPublicKey: EPHEMERAL_PUBLIC_KEY,
      permissions: [permissionRequest],
    },
  };
}

describe('DWebConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDWebConnectStore.setState({
      pendingRequests: [connectRequest()],
      walletReady: false,
    });
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://app.example/request',
    });
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: vi.fn(),
    });

    mocks.createDelegateDid.mockResolvedValue({
      delegateBearerDid: { uri: 'did:jwk:delegate' },
      delegatePortableDid: { uri: 'did:jwk:delegate', privateKeys: [] },
      delegateX25519PrivateKey: { kty: 'OKP', crv: 'X25519', d: 'secret', x: 'public' },
    });
    mocks.createPermissionGrants.mockResolvedValue([{ id: 'grant-1' }]);
    mocks.createSessionRevocationGrants.mockResolvedValue({
      grants: [{ id: 'grant-1' }, { id: 'revoke-grant-1' }],
      sessionRevocations: [{ grantId: 'grant-1', revocationGrantId: 'revoke-grant-1' }],
    });
    mocks.createAndSendGrantKeyRecords.mockResolvedValue([]);
    mocks.encryptDWebConnectResponse.mockResolvedValue({ iv: 'encrypted' });
    mocks.agent.dwn.getRemoteDwnEndpointUrls.mockResolvedValue(['https://dwn.example']);
    mocks.agent.rpc.getServerInfo.mockResolvedValue({ server: '@enbox/dwn-server' });
    mocks.ensureRegistrationForDids.mockResolvedValue(undefined);
    mocks.prepareProtocol.mockResolvedValue(undefined);
    mocks.queryProtocolSetupStatus.mockResolvedValue('install');
    mocks.publishWalletEvent.mockReturnValue(Effect.void);
    mocks.validatePortableOwnerIdentity.mockImplementation(async (portableIdentity: any) => ({
      did: portableIdentity.portableDid.uri,
      dwnEndpoints: ['https://portable-dwn.example'],
      portableIdentity,
    }));
    mocks.permissions = [];
    mocks.identities = [{
      did: { uri: 'did:dht:alice' },
      metadata: { name: 'Alice' },
    }];
    mocks.identitiesLoading = false;
  });

  it('coalesces duplicate approve clicks into one delegate grant response', async () => {
    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(screen.getByText('https://app.example')).toBeInTheDocument();
    expect(screen.getByText(/Reported app name:\s*Example App/i)).toBeInTheDocument();
    expect(screen.getByText('First connection')).toBeInTheDocument();
    expect(screen.getByText('wants to view a custom data type.')).toBeInTheDocument();
    expect(screen.getByText('What app.example will be able to do')).toBeInTheDocument();
    expect(screen.getByText('Access lasts 24 hours')).toBeInTheDocument();

    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.createDelegateDid).toHaveBeenCalledTimes(1);
      expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1);
      expect(mocks.createAndSendGrantKeyRecords).toHaveBeenCalledTimes(1);
    });
    expect(mocks.agent.dwn.getRemoteDwnEndpointUrls).toHaveBeenCalledWith('did:dht:alice');
    expect(mocks.ensureRegistrationForDids).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
      ['did:dht:alice'],
    );
    expect(mocks.createPermissionGrants).toHaveBeenCalledWith(
      'did:dht:alice',
      'did:jwk:delegate',
      permissionRequest.permissionScopes,
      mocks.agent,
      expect.objectContaining({
        appName   : 'Example App',
        origin    : 'https://app.example',
        transport : 'postMessage',
      }),
    );
    expect(mocks.createAndSendGrantKeyRecords).toHaveBeenCalledWith(
      'did:dht:alice',
      'did:jwk:delegate',
      { kty: 'OKP', crv: 'X25519', d: 'secret', x: 'public' },
      [{ id: 'grant-1' }],
      [permissionRequest.protocolDefinition],
      mocks.agent,
    );
    expect(mocks.createSessionRevocationGrants).toHaveBeenCalledWith(
      'did:dht:alice',
      'did:jwk:delegate',
      [{ id: 'grant-1' }],
      expect.any(String),
      mocks.agent,
    );
    expect(mocks.encryptDWebConnectResponse).toHaveBeenCalledWith(
      {
        delegateDid  : { uri: 'did:jwk:delegate', privateKeys: [] },
        connectedDid : 'did:dht:alice',
        grants       : [{ id: 'grant-1' }, { id: 'revoke-grant-1' }],
        sessionRevocations: [{ grantId: 'grant-1', revocationGrantId: 'revoke-grant-1' }],
      },
      EPHEMERAL_PUBLIC_KEY,
    );
    expect(window.opener.postMessage).toHaveBeenCalledWith(
      {
        type: 'dweb-connect-authorization-response',
        encryptedPayload: { iv: 'encrypted' },
      },
      'https://app.example',
    );
  });

  it('does not deliver a private key for an unencrypted protocol read', async () => {
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          permissions: [{
            ...permissionRequest,
            protocolDefinition: {
              ...permissionRequest.protocolDefinition,
              types: {
                task: {
                  schema      : 'https://example.com/protocols/tasks/schema/task',
                  dataFormats : ['application/json'],
                },
              },
            },
          }],
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1));
    expect(mocks.createAndSendGrantKeyRecords).not.toHaveBeenCalled();
  });

  it('does not replace a delivered success when event publication fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.publishWalletEvent.mockReturnValue(Effect.fail(new Error('event unavailable')));

    try {
      render(<DWebConnectPage />);
      const approve = await screen.findByRole('button', { name: 'Approve' });
      await waitFor(() => expect(approve).toBeEnabled());
      fireEvent.click(approve);

      await waitFor(() => expect(warn).toHaveBeenCalledWith(
        'DWeb connect approval event failed:',
        expect.anything(),
      ));
      expect(window.opener.postMessage).not.toHaveBeenCalledWith(
        { type: 'dweb-connect-authorization-response', error: 'connection_failed' },
        'https://app.example',
      );
      expect(await screen.findByText('Connected!')).toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });

  it('creates grants once with all requested scopes after preparing each protocol', async () => {
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          permissions: [permissionRequest, secondPermissionRequest],
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1);
    });
    expect(mocks.prepareProtocol).toHaveBeenCalledTimes(2);
    expect(mocks.createPermissionGrants).toHaveBeenCalledWith(
      'did:dht:alice',
      'did:jwk:delegate',
      [
        ...permissionRequest.permissionScopes,
        ...secondPermissionRequest.permissionScopes,
      ],
      mocks.agent,
      expect.objectContaining({
        appName   : 'Example App',
        origin    : 'https://app.example',
        transport : 'postMessage',
      }),
    );
  });

  it('rejects unsupported scopes before registration or wallet-owned writes', async () => {
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          permissions: [{
            ...permissionRequest,
            permissionScopes: [{
              interface : 'Records',
              method    : 'Query',
              protocol  : permissionRequest.protocolDefinition.protocol,
            }],
          }],
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);

    expect(await screen.findByText('Invalid DWeb Connect request.')).toBeInTheDocument();
    expect(window.opener.postMessage).toHaveBeenCalledWith(
      { type: 'dweb-connect-authorization-response', error: 'connection_failed' },
      'https://app.example',
    );
    expect(mocks.importValidatedIdentity).not.toHaveBeenCalled();
    expect(mocks.ensureRegistrationForDids).not.toHaveBeenCalled();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.createPermissionGrants).not.toHaveBeenCalled();
  });

  it('treats a validation error response as terminal for the current client', async () => {
    const invalidRequest = connectRequest();
    invalidRequest.data.permissions = [{
      ...permissionRequest,
      permissionScopes: [{
        interface : 'Records',
        method    : 'Query',
        protocol  : permissionRequest.protocolDefinition.protocol,
      }],
    }];
    useDWebConnectStore.setState({ pendingRequests: [invalidRequest], walletReady: false });

    render(<DWebConnectPage />);
    expect(await screen.findByRole('button', { name: 'Close' })).toBeInTheDocument();
    window.dispatchEvent(new MessageEvent('message', {
      data   : connectRequest().data,
      origin : 'https://app.example',
      source : window.opener,
    }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    });
  });

  it('notifies the opener immediately when approval fails', async () => {
    mocks.prepareProtocol.mockRejectedValue(new Error('Remote protocol conflict'));

    render(<DWebConnectPage />);
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    expect(await screen.findByText('Remote protocol conflict')).toBeInTheDocument();
    expect(window.opener.postMessage).toHaveBeenCalledWith(
      { type: 'dweb-connect-authorization-response', error: 'connection_failed' },
      'https://app.example',
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('shows when the app already has an active connect session', async () => {
    mocks.permissions = [{
      id          : 'grant-existing',
      grantee     : 'did:jwk:existing',
      dateGranted : '2026-06-23T00:00:00.000Z',
      dateExpires : '2999-06-24T00:00:00.000Z',
      scope       : {
        interface : 'Records',
        method    : 'Read',
        protocol  : 'https://example.com/protocols/tasks',
      },
      connectSession: {
        id        : 'session-existing',
        createdAt : '2026-06-23T00:00:00.000Z',
        expiresAt : '2999-06-24T00:00:00.000Z',
        appName   : 'Example App',
        origin    : 'https://app.example',
        transport : 'postMessage',
      },
      revoke: vi.fn(),
    }];

    render(<DWebConnectPage />);

    expect(await screen.findByText('Returning connection')).toBeInTheDocument();
    expect(screen.getByText(/already has 1 active session/i)).toBeInTheDocument();
    expect(screen.getByText(/separate session with 24 hours of access/i)).toBeInTheDocument();
  });

  it('checks protocol conflicts when an identical portable DID already exists', async () => {
    const portableIdentity = {
      portableDid : { uri: 'did:dht:portable' },
      metadata    : { uri: 'did:dht:portable', name: 'Portable' },
    };
    mocks.identities = [{
      did: { uri: 'did:dht:portable' },
      metadata: { name: 'Portable' },
    }];
    mocks.queryProtocolSetupStatus.mockResolvedValue('conflict');
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          did: 'did:dht:portable',
          portableIdentity,
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Import & Connect' });
    await waitFor(() => expect(mocks.queryProtocolSetupStatus).toHaveBeenCalled());
    expect(await screen.findByText('Protocol setup conflict')).toBeInTheDocument();
    expect(approve).toBeDisabled();
    expect(mocks.importValidatedIdentity).not.toHaveBeenCalled();
  });

  it('shows existing sessions when a portable identity is already owned', async () => {
    const portableIdentity = {
      portableDid : { uri: 'did:dht:portable' },
      metadata    : { uri: 'did:dht:portable', name: 'Portable' },
    };
    mocks.identities = [{
      did: { uri: 'did:dht:portable' },
      metadata: { name: 'Portable' },
    }];
    mocks.permissions = [{
      id          : 'grant-existing',
      grantee     : 'did:jwk:existing',
      dateGranted : '2026-06-23T00:00:00.000Z',
      dateExpires : '2999-06-24T00:00:00.000Z',
      scope       : permissionRequest.permissionScopes[0],
      connectSession: {
        id        : 'session-existing',
        createdAt : '2026-06-23T00:00:00.000Z',
        expiresAt : '2999-06-24T00:00:00.000Z',
        appName   : 'Example App',
        origin    : 'https://app.example',
        transport : 'postMessage',
      },
      revoke: vi.fn(),
    }];
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          did: 'did:dht:portable',
          portableIdentity,
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);

    expect(await screen.findByText('Returning connection')).toBeInTheDocument();
    expect(screen.getByText(/already has 1 active session/i)).toBeInTheDocument();
  });

  it('keeps portable approval blocked until existing identities are known', async () => {
    const portableIdentity = {
      portableDid : { uri: 'did:dht:portable' },
      metadata    : { uri: 'did:dht:portable', name: 'Portable' },
    };
    mocks.identities = [];
    mocks.identitiesLoading = true;
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          did: 'did:dht:portable',
          portableIdentity,
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Import & Connect' });
    expect(approve).toBeDisabled();
    expect(mocks.queryProtocolSetupStatus).not.toHaveBeenCalled();
    expect(mocks.importValidatedIdentity).not.toHaveBeenCalled();
  });

  it('imports and approves a portable identity without a pre-existing identity', async () => {
    const portableIdentity = {
      portableDid : { uri: 'did:dht:portable' },
      metadata    : { uri: 'did:dht:portable', name: 'Portable' },
    };
    mocks.identities = [];
    mocks.importValidatedIdentity.mockResolvedValue({ did: { uri: 'did:dht:portable' } });
    useDWebConnectStore.setState({
      pendingRequests: [{
        ...connectRequest(),
        data: {
          ...connectRequest().data,
          did: 'did:dht:portable',
          portableIdentity,
        },
      }],
      walletReady: false,
    });

    render(<DWebConnectPage />);

    expect(await screen.findByText('Import and approve as')).toBeInTheDocument();
    expect(screen.queryByText(/No identities found/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import & Connect' }));

    await waitFor(() => {
      expect(mocks.importValidatedIdentity).toHaveBeenCalledWith(
        mocks.agent,
        expect.objectContaining({
          did: 'did:dht:portable',
          portableIdentity,
        }),
        { allowExistingExact: true, ensurePublished: true },
      );
      expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1);
    });
    expect(mocks.agent.dwn.getRemoteDwnEndpointUrls).not.toHaveBeenCalledWith('did:dht:portable');
    expect(mocks.ensureRegistrationForDids).not.toHaveBeenCalled();
    expect(mocks.prepareProtocol).toHaveBeenCalledWith(
      'did:dht:portable',
      mocks.agent,
      permissionRequest.protocolDefinition,
    );
    expect(mocks.createPermissionGrants).toHaveBeenCalledWith(
      'did:dht:portable',
      'did:jwk:delegate',
      permissionRequest.permissionScopes,
      mocks.agent,
      expect.any(Object),
    );
    expect(mocks.encryptDWebConnectResponse).toHaveBeenCalledWith(
      expect.objectContaining({ connectedDid: 'did:dht:portable' }),
      EPHEMERAL_PUBLIC_KEY,
    );
  });
});
