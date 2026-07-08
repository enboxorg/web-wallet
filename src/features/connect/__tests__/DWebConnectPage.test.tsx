import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDWebConnectStore, type DWebConnectRequest } from '@/stores/dweb-connect-store';
import DWebConnectPage from '../DWebConnectPage';

const mocks = vi.hoisted(() => ({
  agent: {
    id: 'agent-1',
    dwn: {
      getDwnEndpointUrlsForTarget: vi.fn(),
    },
  },
  createAndSendGrantKeyRecords: vi.fn(),
  createDelegateDid: vi.fn(),
  createPermissionGrants: vi.fn(),
  encryptDWebConnectResponse: vi.fn(),
  ensureRegistration: vi.fn(),
  importPortableIdentity: vi.fn(),
  prepareProtocol: vi.fn(),
  queryProtocolSetupStatus: vi.fn(),
  permissions: [] as any[],
}));

vi.mock('@/enbox/hooks/use-agent', () => ({
  useAgent: () => mocks.agent,
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data: [
      {
        did: { uri: 'did:dht:alice' },
        metadata: { name: 'Alice' },
      },
    ],
  }),
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: () => ({
    data      : mocks.permissions,
    isLoading : false,
    isError   : false,
  }),
}));

vi.mock('@/enbox/registration', () => ({
  ensureRegistration: mocks.ensureRegistration,
}));

vi.mock('../connect-effects', () => ({
  createAndSendGrantKeyRecords: mocks.createAndSendGrantKeyRecords,
  createDelegateDid: mocks.createDelegateDid,
  createPermissionGrants: mocks.createPermissionGrants,
  encryptDWebConnectResponse: mocks.encryptDWebConnectResponse,
  importPortableIdentity: mocks.importPortableIdentity,
}));

vi.mock('../protocol-install', () => ({
  prepareProtocol: mocks.prepareProtocol,
  queryProtocolSetupStatus: mocks.queryProtocolSetupStatus,
}));

const permissionRequest = {
  protocolDefinition: {
    protocol: 'https://example.com/protocols/tasks',
    types: {},
    structure: {},
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
    protocol: 'https://example.com/protocols/profile',
    types: {},
    structure: {},
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
      ephemeralPublicKey: 'dapp-ephemeral-key',
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
    mocks.createAndSendGrantKeyRecords.mockResolvedValue([]);
    mocks.encryptDWebConnectResponse.mockResolvedValue({ iv: 'encrypted' });
    mocks.agent.dwn.getDwnEndpointUrlsForTarget.mockResolvedValue(['https://dwn.example']);
    mocks.ensureRegistration.mockResolvedValue(undefined);
    mocks.prepareProtocol.mockResolvedValue(undefined);
    mocks.queryProtocolSetupStatus.mockResolvedValue('install');
    mocks.permissions = [];
  });

  it('coalesces duplicate approve clicks into one delegate grant response', async () => {
    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(screen.getByText('https://app.example')).toBeInTheDocument();
    expect(screen.getByText(/App name:\s*Example App/i)).toBeInTheDocument();
    expect(screen.getByText('First connection')).toBeInTheDocument();
    expect(screen.getByText('wants to view a custom data type.')).toBeInTheDocument();
    expect(screen.getByText('What app.example will be able to do')).toBeInTheDocument();
    expect(screen.getByText('Access lasts 24 hours')).toBeInTheDocument();

    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.createDelegateDid).toHaveBeenCalledTimes(1);
      expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1);
      expect(mocks.createAndSendGrantKeyRecords).toHaveBeenCalledTimes(1);
    });
    expect(mocks.agent.dwn.getDwnEndpointUrlsForTarget).toHaveBeenCalledWith('did:dht:alice');
    expect(mocks.ensureRegistration).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
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
    expect(mocks.encryptDWebConnectResponse).toHaveBeenCalledWith(
      {
        delegateDid  : { uri: 'did:jwk:delegate', privateKeys: [] },
        connectedDid : 'did:dht:alice',
        grants       : [{ id: 'grant-1' }],
      },
      'dapp-ephemeral-key',
    );
    expect(window.opener.postMessage).toHaveBeenCalledWith(
      {
        type: 'dweb-connect-authorization-response',
        encryptedPayload: { iv: 'encrypted' },
      },
      'https://app.example',
    );
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

    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));

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
    expect(screen.getByText(/separate 24-hour session/i)).toBeInTheDocument();
  });
});
