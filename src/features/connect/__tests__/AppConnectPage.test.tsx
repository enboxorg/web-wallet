import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test-utils';
import AppConnectPage from '../AppConnectPage';
import { __resetDeepLinkSessionForTests, primeConnectDeepLink } from '../connect-deep-link';
import { useAuthStore } from '@/stores/auth-store';

const mocks = vi.hoisted(() => ({
  agent: {
    id: 'agent-1',
    identity: { getDwnEndpoints: vi.fn() },
  },
  approveConnectRequest: vi.fn(),
  denyConnectRequest: vi.fn(),
  fetchConnectRequest: vi.fn(),
  generatePin: vi.fn(),
  waitForRelayCompletion: vi.fn(),
  queryProtocolSetupStatus: vi.fn(),
  reconfigureProtocolsForOverride: vi.fn(),
  scannerHasCamera: vi.fn(),
  authState: { firstTime: false as boolean },
  connectVault: vi.fn(),
  autoCreateIdentity: vi.fn(),
  preparePasskeyVaultPassword: vi.fn(),
  publishWalletEvent: vi.fn(),
  storePasskeyCredential: vi.fn(),
  allPermissions: [] as any[],
  allPermissionsPending: false,
  allPermissionsError: false,
  identitiesPending: false,
  identitiesError: false,
  identities: [
    {
      did: { uri: 'did:dht:alice' },
      metadata: { name: 'Alice' },
    },
  ] as any[],
}));

vi.mock('@/enbox/hooks/use-agent', () => ({
  useAgent: () => mocks.agent,
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({
    initialized: true,
    unlocked: !mocks.authState.firstTime,
    firstTime: mocks.authState.firstTime,
    agent: mocks.authState.firstTime ? null : mocks.agent,
    connect: mocks.connectVault,
    unlock: vi.fn(),
    restore: vi.fn(),
    lock: vi.fn(),
    dwnEndpoints: ['https://dwn.example'],
    error: null,
    isLoading: false,
  }),
}));

vi.mock('@/lib/auto-identity', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/auto-identity')>(),
  autoCreateIdentity: mocks.autoCreateIdentity,
}));

vi.mock('@/lib/passkeys', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/passkeys')>(),
  canCheckPasskeySupport: () => true,
  isPasskeySupported: async () => true,
  preparePasskeyVaultPassword: mocks.preparePasskeyVaultPassword,
  storePasskeyCredential: mocks.storePasskeyCredential,
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data      : mocks.identities,
    isPending : mocks.identitiesPending,
    isError   : mocks.identitiesError,
  }),
}));

vi.mock('@/enbox/hooks/use-all-permissions', () => ({
  useAllPermissions: () => ({
    data      : mocks.allPermissions,
    isPending : mocks.allPermissionsPending,
    isError   : mocks.allPermissionsError,
  }),
}));

vi.mock('@/enbox/hooks/use-permissions', () => ({
  usePermissions: () => ({
    data      : [],
    isLoading : false,
    isError   : false,
  }),
}));

vi.mock('@/enbox/effect/wallet-events', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/enbox/effect/wallet-events')>(),
  publishWalletEvent: mocks.publishWalletEvent,
}));

vi.mock('../connect-kernel', async (importOriginal) => ({
  ...await importOriginal<typeof import('../connect-kernel')>(),
  approveConnectRequest: mocks.approveConnectRequest,
  denyConnectRequest: mocks.denyConnectRequest,
  fetchConnectRequest: mocks.fetchConnectRequest,
  generatePin: mocks.generatePin,
  waitForRelayCompletion: mocks.waitForRelayCompletion,
}));

vi.mock('../protocol-install', async (importOriginal) => ({
  ...await importOriginal<typeof import('../protocol-install')>(),
  queryProtocolSetupStatus: mocks.queryProtocolSetupStatus,
}));

vi.mock('../protocol-override', () => ({
  reconfigureProtocolsForOverride: mocks.reconfigureProtocolsForOverride,
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

function existingSessionGrant(ownerDid: string, delegateDid: string) {
  return {
    id          : `grant-${ownerDid}`,
    grantor     : ownerDid,
    grantee     : delegateDid,
    dateGranted : '2026-07-13T00:00:00.000Z',
    dateExpires : '2999-07-14T00:00:00.000Z',
    scope       : {
      interface : 'Records',
      method    : 'Read',
      protocol  : 'https://example.com/protocols/wireguard-mesh',
    },
    connectSession: {
      id        : `session-${ownerDid}`,
      createdAt : '2026-07-13T00:00:00.000Z',
      expiresAt : '2999-07-14T00:00:00.000Z',
      appName   : 'meshd',
      origin    : 'meshd-cli',
      transport : 'relay',
    },
    revoke: vi.fn(),
  };
}

function setPageUrl(search: string) {
  window.history.replaceState({}, '', `/connect/app${search}`);
}

describe('AppConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDeepLinkSessionForTests();
    mocks.authState.firstTime = false;
    useAuthStore.setState({
      initialized: true,
      firstTime: false,
      agent: mocks.agent as never,
    });
    mocks.scannerHasCamera.mockResolvedValue(false);
    mocks.agent.identity.getDwnEndpoints.mockResolvedValue(['https://dwn.example']);
    mocks.queryProtocolSetupStatus.mockResolvedValue('install');
    mocks.publishWalletEvent.mockReturnValue(Effect.void);
    mocks.waitForRelayCompletion.mockResolvedValue(false);
    mocks.allPermissions = [];
    mocks.allPermissionsPending = false;
    mocks.allPermissionsError = false;
    mocks.identitiesPending = false;
    mocks.identitiesError = false;
    mocks.identities = [{
      did: { uri: 'did:dht:alice' },
      metadata: { name: 'Alice' },
    }];
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
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.approveConnectRequest).toHaveBeenCalledTimes(1);
    });
    expect(mocks.agent.identity.getDwnEndpoints).not.toHaveBeenCalled();
    // Protocol preparation is owned by the approval ceremony itself
    // (agent >=0.8.17) — the wallet no longer runs a pre-approval step.
    expect(mocks.approveConnectRequest).toHaveBeenCalledWith(
      'did:dht:alice',
      connectRequest,
      '1234',
      60 * 60,
      mocks.agent,
    );
    expect(mocks.publishWalletEvent).toHaveBeenCalledWith({
      _tag         : 'connect.approved',
      origin       : 'meshd-cli',
      connectedDid : 'did:dht:alice',
    });

    // PIN phase is shown after a successful submission.
    expect(await screen.findByText('1234')).toBeInTheDocument();
    expect(mocks.waitForRelayCompletion).toHaveBeenCalledWith(connectRequest);
    expect(screen.queryByText('Connected!')).not.toBeInTheDocument();
  });

  it('keeps a completed relay approval successful when freshness publication fails', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);
    mocks.publishWalletEvent.mockReturnValue(Effect.fail(new Error('event bus unavailable')));

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    expect(await screen.findByText('1234')).toBeInTheDocument();
    expect(mocks.publishWalletEvent).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/event bus unavailable/i)).not.toBeInTheDocument();
  });

  it('shows the PIN before completion and flips to confirmed when the app acknowledges', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);
    let resolveCompletion: (completed: boolean) => void = () => undefined;
    mocks.waitForRelayCompletion.mockImplementation(
      () => new Promise<boolean>((resolve) => { resolveCompletion = resolve; }),
    );

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    // The dapp needs this PIN before it can open the response and emit the
    // completion marker, so polling must never hold this screen back.
    expect(await screen.findByText('1234')).toBeInTheDocument();
    expect(screen.queryByText('Connected!')).not.toBeInTheDocument();

    resolveCompletion(true);
    expect(await screen.findByText('Connected!')).toBeInTheDocument();
    expect(screen.queryByText('1234')).not.toBeInTheDocument();
  });

  it('does not start completion polling when approval settles after unmount', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.generatePin.mockResolvedValue('1234');
    let resolveApproval: () => void = () => undefined;
    mocks.approveConnectRequest.mockImplementation(
      () => new Promise<void>((resolve) => { resolveApproval = resolve; }),
    );

    const view = renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    await waitFor(() => expect(mocks.approveConnectRequest).toHaveBeenCalledTimes(1));

    view.unmount();
    await act(async () => { resolveApproval(); });

    expect(mocks.waitForRelayCompletion).not.toHaveBeenCalled();
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
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('defaults to one hour even when the requester asks for longer', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestedSessionTtlSeconds: 90 * 24 * 60 * 60,
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText('Access lasts 1 hour')).toBeInTheDocument();
    expect(screen.getByLabelText('Access duration')).toHaveValue(String(60 * 60));
  });

  it('honors a shorter requested session lifetime during relay approval', async () => {
    const shortRequest = {
      ...connectRequest,
      requestedSessionTtlSeconds: 9 * 60,
    };
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(shortRequest);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText('Access lasts 9 minutes')).toBeInTheDocument();
    expect(screen.queryByLabelText('Access duration')).not.toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => expect(mocks.approveConnectRequest).toHaveBeenCalledWith(
      'did:dht:alice',
      shortRequest,
      '1234',
      9 * 60,
      mocks.agent,
    ));
  });

  it.each([
    ['7 days', 7 * 24 * 60 * 60],
    ['30 days', 30 * 24 * 60 * 60],
  ])('passes the wallet-selected %s duration to relay approval', async (label, seconds) => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    fireEvent.change(await screen.findByLabelText('Access duration'), {
      target: { value: String(seconds) },
    });
    expect(screen.getByText(`Access lasts ${label}`)).toBeInTheDocument();
    const approve = screen.getByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => expect(mocks.approveConnectRequest).toHaveBeenCalledWith(
      'did:dht:alice',
      connectRequest,
      '1234',
      seconds,
      mocks.agent,
    ));
  });

  it('renews a fully revoked session with the exact delegate owner', async () => {
    const refreshRequest = {
      ...connectRequest,
      requestType: 'refresh',
    };
    mocks.identities = [
      { did: { uri: 'did:dht:alice' }, metadata: { name: 'Alice' } },
      { did: { uri: 'did:dht:bob' }, metadata: { name: 'Bob' } },
    ];
    mocks.allPermissions = [
      { ownerDid: 'did:dht:alice', permissions: [], revokedGrantIds: [] },
      {
        ownerDid        : 'did:dht:bob',
        permissions     : [existingSessionGrant('did:dht:bob', connectRequest.delegateDid)],
        revokedGrantIds : ['grant-did:dht:bob'],
      },
    ];
    mocks.fetchConnectRequest.mockResolvedValue(refreshRequest);
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);
    setPageUrl(DEEP_LINK_FRAGMENT);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const renew = await screen.findByRole('button', { name: 'Renew access' });
    expect(screen.getByText(/Renewing as/)).toHaveTextContent('Renewing as Bob');
    expect(screen.getByText('Revoked')).toBeVisible();
    expect(screen.getByText('Previous access was revoked.')).toBeVisible();
    expect(screen.queryByLabelText('Approve as profile')).not.toBeInTheDocument();
    expect(screen.getByText('View a custom data type')).toBeVisible();
    await waitFor(() => expect(renew).toBeEnabled());
    fireEvent.click(renew);

    await waitFor(() => {
      expect(mocks.approveConnectRequest).toHaveBeenCalledWith(
        'did:dht:bob',
        refreshRequest,
        '1234',
        60 * 60,
        mocks.agent,
      );
    });
  });

  it('blocks relay renewal when the request names a different previous profile', async () => {
    const refreshRequest = {
      ...connectRequest,
      requestType         : 'refresh',
      expectedProviderDid : 'did:dht:bob',
    };
    mocks.allPermissions = [{
      ownerDid        : 'did:dht:alice',
      permissions     : [existingSessionGrant('did:dht:alice', connectRequest.delegateDid)],
      revokedGrantIds : [],
    }];
    mocks.fetchConnectRequest.mockResolvedValue(refreshRequest);
    setPageUrl(DEEP_LINK_FRAGMENT);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/names a different profile than the previous session/i))
      .toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renew access' })).toBeDisabled();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', true, false, /Checking the previous connection/i],
    ['error', false, true, /could not verify the previous connection/i],
    ['not found', false, false, /No previous session for this delegate/i],
  ])('fails closed when refresh session lookup is %s', async (_label, pending, error, message) => {
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestType: 'refresh',
    });
    mocks.allPermissionsPending = pending;
    mocks.allPermissionsError = error;
    setPageUrl(DEEP_LINK_FRAGMENT);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renew access' })).toBeDisabled();
    expect(screen.queryByLabelText('Approve as profile')).not.toBeInTheDocument();
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('fails closed instead of waiting forever when a refresh reaches a fresh wallet', async () => {
    mocks.authState.firstTime = true;
    useAuthStore.setState({
      initialized : true,
      firstTime   : true,
      agent       : null,
    });
    mocks.identities = [];
    mocks.identitiesPending = true;
    mocks.allPermissionsError = true;
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestType: 'refresh',
    });
    setPageUrl(DEEP_LINK_FRAGMENT);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/could not verify the previous connection/i)).toBeInTheDocument();
    expect(screen.queryByText(/Checking the previous connection/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Renew access' })).toBeDisabled();
    expect(screen.queryByText(/we'll make one/i)).not.toBeInTheDocument();
  });

  it('rejects an invalid relay session lifetime before approval', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue({
      ...connectRequest,
      requestedSessionTtlSeconds: 0.5,
    });

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByText(/invalid session lifetime/i)).toBeInTheDocument();
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
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('replaces an overridable protocol only after opt-in and confirmation', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.queryProtocolSetupStatus.mockResolvedValue('override');
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);
    mocks.reconfigureProtocolsForOverride.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    const approve = await screen.findByRole('button', { name: 'Approve' });
    // The override opt-in appears and approval stays blocked until it is ticked.
    const checkbox = await screen.findByRole('checkbox');
    expect(approve).toBeDisabled();

    fireEvent.click(checkbox);
    await waitFor(() => expect(approve).toBeEnabled());

    // Approving opens the confirmation dialog rather than connecting immediately.
    fireEvent.click(approve);
    const confirm = await screen.findByRole('button', { name: /replace & connect/i });
    expect(mocks.reconfigureProtocolsForOverride).not.toHaveBeenCalled();

    fireEvent.click(confirm);

    // The owner reconfigure runs (with the requested definition) before the ceremony.
    await waitFor(() => expect(mocks.reconfigureProtocolsForOverride).toHaveBeenCalledTimes(1));
    expect(mocks.reconfigureProtocolsForOverride).toHaveBeenCalledWith(
      'did:dht:alice',
      mocks.agent,
      ['https://dwn.example'],
      [connectRequest.permissionRequests[0].protocolDefinition],
    );
    expect(mocks.agent.identity.getDwnEndpoints).toHaveBeenCalledWith({
      didUri  : 'did:dht:alice',
      refresh : true,
    });

    await waitFor(() => expect(mocks.approveConnectRequest).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('1234')).toBeInTheDocument();
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
    mocks.generatePin.mockResolvedValue('1234');
    mocks.approveConnectRequest.mockResolvedValue(undefined);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => expect(mocks.approveConnectRequest).toHaveBeenCalledTimes(1));
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
    expect(mocks.approveConnectRequest).not.toHaveBeenCalled();
  });

  it('adopts the ceremony after a remount instead of falling back to the scanner', async () => {
    // The fragment is stripped on first parse and the relay pointer is
    // single-use, so a remount (e.g. AuthGate re-branching while inline
    // onboarding flips the auth store) must restore the fetched request —
    // never show the scanner or refetch the consumed pointer.
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);

    const view = renderWithProviders(<AppConnectPage />, {
      initialRoute: `/connect/app${DEEP_LINK_FRAGMENT}`,
    });
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    view.unmount();

    // Remount with the fragment long gone.
    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByText(/No camera found/i)).not.toBeInTheDocument();
    expect(mocks.fetchConnectRequest).toHaveBeenCalledTimes(1);
    expect(mocks.scannerHasCamera).not.toHaveBeenCalled();
  });

  it('adopts a session primed at boot, before the page ever mounts', async () => {
    // Returning-but-locked wallets sit on the unlock screen between the QR
    // scan and this page mounting. main.tsx primes the deep-link fetch at
    // boot so the single-use relay pointer is dereferenced immediately; the
    // page must adopt that session (fragment long gone) without refetching.
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);

    primeConnectDeepLink();
    expect(window.location.hash).toBe('');
    expect(mocks.fetchConnectRequest).toHaveBeenCalledTimes(1);

    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(mocks.fetchConnectRequest).toHaveBeenCalledTimes(1);
    expect(mocks.scannerHasCamera).not.toHaveBeenCalled();
  });

  it('adopts a still-loading ceremony after a remount', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    let resolveFetch: (value: typeof connectRequest) => void = () => undefined;
    mocks.fetchConnectRequest.mockImplementation(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const view = renderWithProviders(<AppConnectPage />, {
      initialRoute: `/connect/app${DEEP_LINK_FRAGMENT}`,
    });
    expect(await screen.findByText(/Fetching connection request/i)).toBeInTheDocument();
    view.unmount();

    // Remount while the fetch is still in flight — the new instance waits
    // on the same promise and lands on the consent UI when it settles.
    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    expect(await screen.findByText(/Fetching connection request/i)).toBeInTheDocument();

    resolveFetch(connectRequest);
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(mocks.fetchConnectRequest).toHaveBeenCalledTimes(1);
  });

  it('releases the ceremony when the user denies, so the scanner returns', async () => {
    setPageUrl(DEEP_LINK_FRAGMENT);
    mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
    mocks.denyConnectRequest.mockResolvedValue(undefined);

    const view = renderWithProviders(<AppConnectPage />, {
      initialRoute: `/connect/app${DEEP_LINK_FRAGMENT}`,
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(mocks.denyConnectRequest).toHaveBeenCalled());
    view.unmount();

    // A later plain visit is a fresh scan, not a stale ceremony.
    renderWithProviders(<AppConnectPage />, { initialRoute: '/connect/app' });
    expect(await screen.findByText(/No camera found/i)).toBeInTheDocument();
  });

  describe('deep-link arrival with no wallet (relay-path onboarding)', () => {
    beforeEach(() => {
      mocks.authState.firstTime = true;
      useAuthStore.setState({
        initialized: true,
        firstTime: true,
        agent: null,
      });
      mocks.fetchConnectRequest.mockResolvedValue(connectRequest);
      mocks.generatePin.mockResolvedValue('1234');
      mocks.approveConnectRequest.mockResolvedValue(undefined);
      mocks.preparePasskeyVaultPassword.mockResolvedValue({
        password: 'wrapped-vault-password',
        credential: { credentialId: 'cred-1' },
      });
      // connect() unlocks the vault: reflect that in the store so the
      // approve flow finds the live agent right after onboarding.
      mocks.connectVault.mockImplementation(async () => {
        useAuthStore.setState({ agent: mocks.agent as never, firstTime: false });
        return 'recovery phrase words';
      });
      mocks.autoCreateIdentity.mockResolvedValue({ did: { uri: 'did:dht:fresh' } });
    });

    it('offers create-wallet-and-connect and completes approval with the new profile', async () => {
      setPageUrl(DEEP_LINK_FRAGMENT);
      renderWithProviders(<AppConnectPage />, { initialRoute: `/connect/app${DEEP_LINK_FRAGMENT}` });

      const create = await screen.findByRole('button', { name: /create wallet & connect/i });
      expect(screen.getByText(/No wallet here yet/)).toBeInTheDocument();
      // The approve-as selector is replaced by the onboarding explainer.
      expect(screen.queryByLabelText('Approve as profile')).not.toBeInTheDocument();

      fireEvent.click(create);

      await waitFor(() => {
        expect(mocks.approveConnectRequest).toHaveBeenCalledWith(
          'did:dht:fresh',
          connectRequest,
          '1234',
          60 * 60,
          mocks.agent,
        );
      });
      expect(mocks.connectVault).toHaveBeenCalledWith('wrapped-vault-password', ['https://dwn.example']);
      expect(mocks.autoCreateIdentity).toHaveBeenCalledWith(mocks.agent, ['https://dwn.example']);
      expect(mocks.storePasskeyCredential).toHaveBeenCalledWith({ credentialId: 'cred-1' });
      expect(mocks.storePasskeyCredential.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.approveConnectRequest.mock.invocationCallOrder[0]);

      // The pairing code screen closes the loop.
      expect(await screen.findByText('1234')).toBeInTheDocument();
    });

    it('does not offer onboarding when the requester rejects did:dht', async () => {
      mocks.fetchConnectRequest.mockResolvedValue({
        ...connectRequest,
        supportedDidMethods: ['did:jwk'],
      });
      setPageUrl(DEEP_LINK_FRAGMENT);
      renderWithProviders(<AppConnectPage />, { initialRoute: `/connect/app${DEEP_LINK_FRAGMENT}` });

      await screen.findByText(/None of your profiles are supported/i);
      expect(screen.queryByRole('button', { name: /create wallet & connect/i })).not.toBeInTheDocument();
    });
  });
});
