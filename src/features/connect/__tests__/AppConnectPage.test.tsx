import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test-utils';
import AppConnectPage from '../AppConnectPage';
import { __resetDeepLinkSessionForTests, primeConnectDeepLink } from '../connect-deep-link';
import { useAuthStore } from '@/stores/auth-store';

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
  queryProtocolSetupStatus: vi.fn(),
  scannerHasCamera: vi.fn(),
  authState: { firstTime: false as boolean },
  connectVault: vi.fn(),
  autoCreateIdentity: vi.fn(),
  preparePasskeyVaultPassword: vi.fn(),
  storePasskeyCredential: vi.fn(),
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
    __resetDeepLinkSessionForTests();
    mocks.authState.firstTime = false;
    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: mocks.agent as never,
    });
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
    // Protocol preparation is owned by the approval ceremony itself
    // (agent >=0.8.17) — the wallet no longer runs a pre-approval step.
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
        unlocked: false,
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
        useAuthStore.setState({ agent: mocks.agent as never, unlocked: true, firstTime: false });
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
          mocks.agent,
        );
      });
      expect(mocks.connectVault).toHaveBeenCalledWith('wrapped-vault-password', ['https://dwn.example']);
      expect(mocks.autoCreateIdentity).toHaveBeenCalledWith(mocks.agent, ['https://dwn.example']);
      expect(mocks.storePasskeyCredential).toHaveBeenCalledWith({ credentialId: 'cred-1' });

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
