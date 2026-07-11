import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test-utils';
import AppConnectPage from '../AppConnectPage';

const mocks = vi.hoisted(() => ({
  agent: {
    id: 'agent-1',
    dwn: { getRemoteDwnEndpointUrls: vi.fn() },
  },
  approveConnectRequest: vi.fn(),
  denyConnectRequest: vi.fn(),
  ensureRegistrationForDids: vi.fn(),
  fetchConnectRequest: vi.fn(),
  generatePin: vi.fn(),
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

vi.mock('../connect-kernel', async (importOriginal) => ({
  ...await importOriginal<typeof import('../connect-kernel')>(),
  approveConnectRequest: mocks.approveConnectRequest,
  denyConnectRequest: mocks.denyConnectRequest,
  fetchConnectRequest: mocks.fetchConnectRequest,
  generatePin: mocks.generatePin,
}));

vi.mock('../protocol-install', async (importOriginal) => ({
  ...await importOriginal<typeof import('../protocol-install')>(),
  prepareProtocol: mocks.prepareProtocol,
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

// 32 zero bytes, base64url-encoded — parseWalletConnectUri validates the
// fragment key is exactly 32 bytes, so the deep-link tests need a real one.
const ENCRYPTION_KEY_B64U = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const DEEP_LINK_FRAGMENT = `#request_uri=https%3A%2F%2Frelay.example%2Fconnect%2Fabc123.jwt&encryption_key=${ENCRYPTION_KEY_B64U}`;

const connectRequest = {
  clientDid      : 'did:jwk:cli-client',
  appName        : 'meshd',
  clientMetadata : { origin: 'meshd-cli' },
  delegateDid    : 'did:jwk:pre-supplied-delegate',
  reply          : { mode: 'direct_post', callbackUrl: 'https://relay.example/connect/callback' },
  state          : 'state-1',
  nonce          : 'nonce-1',
  responseKey    : { kty: 'OKP', crv: 'X25519', x: 'client-response-key' },
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
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);

    renderWithProviders(<AppConnectPage />, {
      initialRoute: `/connect/app${DEEP_LINK_FRAGMENT}`,
    });

    // Deep link goes straight to the consent UI...
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByText(/Reported app name:\s*meshd/i)).toBeInTheDocument();

    // ...via the same fetch path the scanner uses, with the fragment key
    // decoded to its 32 raw bytes.
    expect(mocks.fetchConnectRequest).toHaveBeenCalledTimes(1);
    expect(mocks.fetchConnectRequest).toHaveBeenCalledWith(
      'https://relay.example/connect/abc123.jwt',
      new Uint8Array(32),
    );
    expect(window.location.hash).toBe('');

    // The camera never starts for a link-initiated flow.
    expect(mocks.scannerHasCamera).not.toHaveBeenCalled();
  });

  it('scrubs an incomplete secret-bearing fragment before showing an error', async () => {
    setPageUrl(`#encryption_key=${ENCRYPTION_KEY_B64U}`);

    renderWithProviders(<AppConnectPage />, {
      initialRoute: `/connect/app#encryption_key=${ENCRYPTION_KEY_B64U}`,
    });

    expect(await screen.findByText(/missing request_uri or encryption_key/i)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(mocks.fetchConnectRequest).not.toHaveBeenCalled();
  });

  it('runs the approval ceremony after a deep-link fetch', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.prepareProtocol.mockResolvedValue(undefined);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.approveConnectRequest).toHaveBeenCalledTimes(1);
    });
    expect(mocks.ensureRegistrationForDids).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
      ['did:dht:alice'],
    );
    // Protocols are prepared by the wallet (install/upgrade + remote
    // verification) BEFORE the non-idempotent approval ceremony runs.
    expect(mocks.prepareProtocol).toHaveBeenCalledWith(
      'did:dht:alice',
      mocks.agent,
      connectRequest.permissionRequests[0].protocolDefinition,
    );
    expect(mocks.prepareProtocol.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.approveConnectRequest.mock.invocationCallOrder[0]);
    expect(mocks.approveConnectRequest).toHaveBeenCalledWith(
      'did:dht:alice',
      connectRequest,
      '1234',
      mocks.agent,
    );

    // PIN phase is shown after a successful submission.
    expect(await screen.findByText('1234')).toBeInTheDocument();
  });

  it('shows an error when the deep-link connect request cannot be fetched', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockRejectedValue(new Error('Request expired'));

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText('Request expired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
  });

  it('sends a denial to the relay callback when the user denies', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.denyConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const deny = await screen.findByRole('button', { name: 'Deny' });
    fireEvent.click(deny);

    await waitFor(() => {
      expect(mocks.denyConnectRequest).toHaveBeenCalledWith(
        'https://relay.example/connect/callback',
        'state-1',
      );
    });
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('shows the requested relay session lifetime', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestedSessionTtlSeconds: 90 * 24 * 60 * 60,
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText('Access lasts 90 days')).toBeInTheDocument();
  });

  it('rejects an invalid relay session lifetime before approval', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestedSessionTtlSeconds: 0.5,
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/invalid session lifetime/i)).toBeInTheDocument();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('rejects an invalid supplied delegate before protocol setup', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      delegateDid: ' did:jwk:delegate',
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/invalid delegate DID/i)).toBeInTheDocument();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('blocks approval when no identity uses a requester-supported DID method', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      supportedDidMethods: ['did:jwk'],
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/None of your profiles are supported/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('blocks approval when protocol verification finds a conflict', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.queryProtocolSetupStatus.mockResolvedValue('conflict');

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    expect(await screen.findByText('Protocol setup conflict')).toBeInTheDocument();
    expect(approve).toBeDisabled();
    expect(mocks.prepareProtocol).not.toHaveBeenCalled();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('prepares an identical requested protocol only once', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
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
    mocks.approveConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => expect(mocks.approveConnectRequest).toHaveBeenCalledTimes(1));
    // The preflight dedupes identical definitions, so the shared protocol is
    // prepared a single time despite appearing in two permission requests.
    expect(mocks.prepareProtocol).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched permission scopes before protocol setup', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
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
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });
});
