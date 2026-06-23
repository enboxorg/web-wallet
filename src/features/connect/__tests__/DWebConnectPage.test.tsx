import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDWebConnectStore, type DWebConnectRequest } from '@/stores/dweb-connect-store';
import DWebConnectPage from '../DWebConnectPage';

const mocks = vi.hoisted(() => ({
  agent: { id: 'agent-1' },
  createDelegateDid: vi.fn(),
  createPermissionGrants: vi.fn(),
  deriveScopedDecryptionKeys: vi.fn(),
  encryptDWebConnectResponse: vi.fn(),
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
    mocks.prepareProtocol.mockResolvedValue(undefined);
  });

  it('coalesces duplicate approve clicks into one delegate grant response', async () => {
    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });

    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.createDelegateDid).toHaveBeenCalledTimes(1);
      expect(mocks.createPermissionGrants).toHaveBeenCalledTimes(1);
    });
    expect(window.opener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dweb-connect-authorization-response',
        connectedDid: 'did:dht:alice',
        grants: [{ id: 'grant-1' }],
      }),
      'https://app.example',
    );
  });
});
