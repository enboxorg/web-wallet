import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test-utils';
import AppConnectPage from '../AppConnectPage';

const mocks = vi.hoisted(() => ({
  agent: {
    id: 'agent-1',
    dwn: { getRemoteDwnEndpointUrls: vi.fn() },
  },
  denyConnectRequest: vi.fn(),
  ensureRegistrationForDids: vi.fn(),
  fetchConnectRequest: vi.fn(),
  generatePin: vi.fn(),
  submitConnectResponse: vi.fn(),
  prepareProtocol: vi.fn(),
  queryProtocolSetupStatus: vi.fn(),
  scannerHasCamera: vi.fn(),
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
  ensureRegistrationForDids: mocks.ensureRegistrationForDids,
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: () => ({
    data      : [],
    isLoading : false,
    isError   : false,
  }),
}));

vi.mock('../connect-effects', () => ({
  denyConnectRequest: mocks.denyConnectRequest,
  fetchConnectRequest: mocks.fetchConnectRequest,
  generatePin: mocks.generatePin,
  submitConnectResponse: mocks.submitConnectResponse,
}));

vi.mock('../protocol-install', () => ({
  getRequestedProtocolDefinitionsConflictMessage: vi.fn(),
  getProtocolSetupStatus: vi.fn(() => 'install'),
  prepareProtocol: mocks.prepareProtocol,
  protocolDefinitionsMatch: vi.fn(() => true),
  protocolHasEncryptedTypes: vi.fn(() => false),
  queryProtocolSetupStatus: mocks.queryProtocolSetupStatus,
}));

vi.mock('qr-scanner', () => ({
  default: class MockScanner {
    static hasCamera = (...args: unknown[]) => mocks.scannerHasCamera(...args);
    static listCameras = vi.fn(async () => []);
    static scanImage = vi.fn();
    destroy() {}
    pause() {}
    async start() {}
    async hasFlash() { return false; }
    isFlashOn() { return false; }
    async toggleFlash() {}
    setCamera() {}
  },
}));

const connectRequest = {
  clientDid      : 'did:jwk:cli-client',
  appName        : 'meshd',
  clientMetadata : { origin: 'meshd-cli' },
  delegateDid    : 'did:jwk:pre-supplied-delegate',
  callbackUrl    : 'https://relay.example/connect/callback',
  state          : 'state-1',
  nonce          : 'nonce-1',
  responseMode   : 'direct_post',
  supportedDidMethods: ['did:dht'],
  permissionRequests: [
    {
      protocolDefinition: {
        protocol  : 'https://example.com/protocols/wireguard-mesh',
        published : false,
        types     : {},
        structure : {},
      },
      permissionScopes: [
        {
          interface : 'Records',
          method    : 'Read',
          protocol  : 'https://example.com/protocols/wireguard-mesh',
        },
      ],
    },
  ],
};

function setPageUrl(search: string) {
  window.history.replaceState({}, '', `/connect/app${search}`);
}

describe('AppConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scannerHasCamera.mockResolvedValue(false);
    mocks.agent.dwn.getRemoteDwnEndpointUrls.mockResolvedValue(['https://dwn.example']);
    mocks.ensureRegistrationForDids.mockResolvedValue(undefined);
    mocks.queryProtocolSetupStatus.mockResolvedValue('install');
    setPageUrl('');
  });

  it('shows the scanner when no deep-link parameters are present', async () => {
    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    // No camera in the test environment, so the scanner falls back to the
    // image-upload UI — the point is that the scanning phase renders and no
    // connect request is fetched.
    expect(await screen.findByText(/No camera found/i)).toBeInTheDocument();
    expect(mocks.fetchConnectRequest).not.toHaveBeenCalled();
  });

  it('fetches the connect request from request_uri + encryption_key in the URI fragment', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);

    renderWithProviders(<AppConnectPage />, {
      initialRoute: '/connect/app#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u',
    });

    // Deep link goes straight to the consent UI...
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByText(/Reported app name:\s*meshd/i)).toBeInTheDocument();

    // ...via the same fetch path the scanner uses.
    expect(mocks.fetchConnectRequest).toHaveBeenCalledTimes(1);
    expect(mocks.fetchConnectRequest).toHaveBeenCalledWith(
      'https://relay.example/connect/abc123.jwt',
      'enc-key-b64u',
    );
    expect(window.location.hash).toBe('');

    // The camera never starts for a link-initiated flow.
    expect(mocks.scannerHasCamera).not.toHaveBeenCalled();
  });

  it('scrubs an incomplete secret-bearing fragment before showing an error', async () => {
    setPageUrl('#encryption_key=enc-key-b64u');

    renderWithProviders(<AppConnectPage />, {
      initialRoute: '/connect/app#encryption_key=enc-key-b64u',
    });

    expect(await screen.findByText(/missing request_uri or encryption_key/i)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(mocks.fetchConnectRequest).not.toHaveBeenCalled();
  });

  it('runs the normal approval flow after a deep-link fetch', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.prepareProtocol.mockResolvedValue(undefined);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.submitConnectResponse.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.submitConnectResponse).toHaveBeenCalledTimes(1);
    });
    expect(mocks.prepareProtocol).toHaveBeenCalledWith(
      'did:dht:alice',
      mocks.agent,
      connectRequest.permissionRequests[0].protocolDefinition,
    );
    expect(mocks.ensureRegistrationForDids).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
      ['did:dht:alice'],
    );
    expect(mocks.submitConnectResponse).toHaveBeenCalledWith(
      'did:dht:alice',
      connectRequest,
      '1234',
      mocks.agent,
    );

    // PIN phase is shown after a successful submission.
    expect(await screen.findByText('1234')).toBeInTheDocument();
  });

  it('shows an error when the deep-link connect request cannot be fetched', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fexpired.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockRejectedValue(new Error('Request expired'));

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText('Request expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('shows the requested relay session lifetime', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestedSessionTtlSeconds: 90 * 24 * 60 * 60,
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText('Access lasts 90 days')).toBeInTheDocument();
  });

  it('rejects an invalid relay session lifetime before approval', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestedSessionTtlSeconds: 0.5,
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/invalid session lifetime/i)).toBeInTheDocument();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.submitConnectResponse).not.toHaveBeenCalled();
  });

  it('rejects an invalid supplied delegate before protocol setup', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      delegateDid: ' did:jwk:delegate',
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/invalid delegate DID/i)).toBeInTheDocument();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.submitConnectResponse).not.toHaveBeenCalled();
  });

  it('blocks approval when no identity uses a requester-supported DID method', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      supportedDidMethods: ['did:jwk'],
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/No identity uses a DID method supported/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
  });

  it('prepares an identical requested protocol only once', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      permissionRequests: [
        connectRequest.permissionRequests[0],
        {
          ...connectRequest.permissionRequests[0],
          permissionScopes: [{
            interface : 'Records',
            method    : 'Write',
            protocol  : connectRequest.permissionRequests[0].protocolDefinition.protocol,
          }],
        },
      ],
    });
    mocks.prepareProtocol.mockResolvedValue(undefined);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.submitConnectResponse.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => expect(mocks.submitConnectResponse).toHaveBeenCalledTimes(1));
    expect(mocks.prepareProtocol).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched permission scopes before protocol setup', async () => {
    setPageUrl('#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=enc-key-b64u');
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      permissionRequests: [{
        ...connectRequest.permissionRequests[0],
        permissionScopes: [{
          interface : 'Records',
          method    : 'Read',
          protocol  : 'https://evil.example/protocol',
        }],
      }],
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    expect(await screen.findByText(/permission scopes must match/i)).toBeInTheDocument();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.submitConnectResponse).not.toHaveBeenCalled();
  });
});
