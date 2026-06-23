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
  createDelegateDid: vi.fn(),
  createPermissionGrants: vi.fn(),
  deriveScopedDecryptionKeys: vi.fn(),
  encryptDWebConnectResponse: vi.fn(),
  ensureRegistration: vi.fn(),
  importPortableIdentity: vi.fn(),
  prepareProtocol: vi.fn(),
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

vi.mock('@/enbox/registration', () => ({
  ensureRegistration: mocks.ensureRegistration,
}));

vi.mock('../connect-effects', () => ({
  createDelegateDid: mocks.createDelegateDid,
  createPermissionGrants: mocks.createPermissionGrants,
  deriveScopedDecryptionKeys: mocks.deriveScopedDecryptionKeys,
  encryptDWebConnectResponse: mocks.encryptDWebConnectResponse,
  importPortableIdentity: mocks.importPortableIdentity,
}));

vi.mock('../protocol-install', () => ({
  prepareProtocol: mocks.prepareProtocol,
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
    });
    mocks.createPermissionGrants.mockResolvedValue([{ id: 'grant-1' }]);
    mocks.deriveScopedDecryptionKeys.mockResolvedValue([]);
    mocks.agent.dwn.getDwnEndpointUrlsForTarget.mockResolvedValue(['https://dwn.example']);
    mocks.ensureRegistration.mockResolvedValue(undefined);
    mocks.prepareProtocol.mockResolvedValue(undefined);
  });

  it('coalesces duplicate approve clicks into one delegate grant response', async () => {
    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(screen.getByText('Temporary session')).toBeInTheDocument();
    expect(screen.getByText(/permissions for 24 hours/i)).toBeInTheDocument();

    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.createDelegateDid).toHaveBeenCalledTimes(1);
      expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1);
    });
    expect(mocks.agent.dwn.getDwnEndpointUrlsForTarget).toHaveBeenCalledWith('did:dht:alice');
    expect(mocks.ensureRegistration).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
    );
    expect(mocks.createPermissionGrants).toHaveBeenCalledWith(
      'did:dht:alice',
      { uri: 'did:jwk:delegate' },
      permissionRequest.permissionScopes,
      mocks.agent,
      expect.objectContaining({
        appName   : 'Example App',
        origin    : 'https://app.example',
        transport : 'postMessage',
      }),
    );
    expect(window.opener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dweb-connect-authorization-response',
        connectedDid: 'did:dht:alice',
        grants: [{ id: 'grant-1' }],
      }),
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
      { uri: 'did:jwk:delegate' },
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
});
