import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DWebConnectPage from '../DWebConnectPage';
import { useAuthStore } from '@/stores/auth-store';

const mocks = vi.hoisted(() => {
  const transport = {
    dappOrigin   : 'https://app.example',
    awaitRequest : vi.fn(),
    sendResponse : vi.fn(),
    deny         : vi.fn(),
    close        : vi.fn(),
  };
  return {
    agent: {
      id: 'agent-1',
      dwn: {
        getRemoteDwnEndpointUrls: vi.fn(),
      },
    },
    approvePopupConnectRequest: vi.fn(),
    createTransport: vi.fn(),
    ensureRegistrationForDids: vi.fn(),
    queryProtocolSetupStatus: vi.fn(),
    publishWalletEvent: vi.fn(),
    transport,
    permissions: [] as any[],
    identities: [
      {
        did: { uri: 'did:dht:alice' },
        metadata: { name: 'Alice' },
      },
    ] as any[],
  };
});

vi.mock('@/enbox/hooks/use-agent', () => ({
  useAgent: () => mocks.agent,
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({
    initialized: true,
    unlocked: true,
    firstTime: false,
    agent: mocks.agent,
    connect: vi.fn(),
    unlock: vi.fn(),
    restore: vi.fn(),
    lock: vi.fn(),
    dwnEndpoints: ['https://dwn.example'],
    error: null,
    isLoading: false,
  }),
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({
    data      : mocks.identities,
    isLoading : false,
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

vi.mock('@enbox/browser', () => ({
  WalletPostMessageTransport: {
    create: mocks.createTransport,
  },
}));

vi.mock('../connect-kernel', async (importOriginal) => ({
  ...await importOriginal<typeof import('../connect-kernel')>(),
  approvePopupConnectRequest: mocks.approvePopupConnectRequest,
}));

vi.mock('../protocol-install', async (importOriginal) => ({
  ...await importOriginal<typeof import('../protocol-install')>(),
  queryProtocolSetupStatus: mocks.queryProtocolSetupStatus,
}));

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

function connectRequest() {
  return {
    clientDid      : 'did:jwk:dapp-client',
    appName        : 'Example App',
    clientMetadata : { origin: 'https://claimed.example' },
    reply          : { mode: 'post_message' },
    state          : 'state-1',
    nonce          : 'nonce-1',
    responseKey    : { kty: 'OKP', crv: 'X25519', x: 'client-response-key' },
    supportedDidMethods: ['did:dht', 'did:jwk'],
    permissionRequests: [permissionRequest],
  };
}

describe('DWebConnectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      initialized: true,
      unlocked: true,
      firstTime: false,
      agent: mocks.agent as never,
    });
    Object.defineProperty(window, 'opener', {
      configurable: true,
      value: { postMessage: vi.fn() },
    });
    Object.defineProperty(window, 'close', {
      configurable: true,
      value: vi.fn(),
    });

    mocks.transport.dappOrigin = 'https://app.example';
    mocks.createTransport.mockResolvedValue(mocks.transport);
    mocks.transport.awaitRequest.mockResolvedValue(connectRequest());
    mocks.approvePopupConnectRequest.mockResolvedValue('sealed-response-jwe');
    mocks.agent.dwn.getRemoteDwnEndpointUrls.mockResolvedValue(['https://dwn.example']);
    mocks.ensureRegistrationForDids.mockResolvedValue(undefined);
    mocks.queryProtocolSetupStatus.mockResolvedValue('install');
    mocks.publishWalletEvent.mockReturnValue(Effect.void);
    mocks.permissions = [];
    mocks.identities = [{
      did: { uri: 'did:dht:alice' },
      metadata: { name: 'Alice' },
    }];
  });

  it('shows guidance when not opened as a popup', async () => {
    Object.defineProperty(window, 'opener', { configurable: true, value: null });

    render(<DWebConnectPage />);

    expect(await screen.findByText(/This page handles connection requests/i)).toBeInTheDocument();
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('shows the consent UI with the transport-pinned dapp origin', async () => {
    render(<DWebConnectPage />);

    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    // The requester label is the transport-authenticated origin, not the
    // request's claimed clientMetadata.origin.
    expect(screen.getByText('https://app.example')).toBeInTheDocument();
    expect(screen.queryByText('https://claimed.example')).not.toBeInTheDocument();
    expect(screen.getByText(/Reported app name:\s*Example App/i)).toBeInTheDocument();
  });

  it('approves via the ceremony and posts the sealed response', async () => {
    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.transport.sendResponse).toHaveBeenCalledWith('sealed-response-jwe');
    });
    expect(mocks.ensureRegistrationForDids).toHaveBeenCalledWith(
      mocks.agent,
      ['https://dwn.example'],
      ['did:dht:alice'],
    );
    expect(mocks.approvePopupConnectRequest).toHaveBeenCalledWith(
      'did:dht:alice',
      expect.objectContaining({ clientDid: 'did:jwk:dapp-client', state: 'state-1' }),
      'https://app.example',
      mocks.agent,
    );
    expect(await screen.findByText('Connected!')).toBeInTheDocument();
    expect(mocks.publishWalletEvent).toHaveBeenCalledWith(expect.objectContaining({
      _tag         : 'connect.approved',
      origin       : 'https://app.example',
      connectedDid : 'did:dht:alice',
    }));
  });

  it('locks out duplicate approvals: the consent actions unmount on first click', async () => {
    let releaseApproval: (value: string) => void = () => {};
    mocks.approvePopupConnectRequest.mockImplementation(
      () => new Promise<string>((resolve) => { releaseApproval = resolve; }),
    );

    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    // The double-submit protection: the page leaves the 'request' phase
    // synchronously on approve, so the Approve button is unmounted before a
    // second click can reach it — the non-idempotent ceremony cannot be
    // started twice from the UI.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    });

    releaseApproval('sealed-response-jwe');

    await waitFor(() => {
      expect(mocks.transport.sendResponse).toHaveBeenCalledTimes(1);
    });
    expect(mocks.approvePopupConnectRequest).toHaveBeenCalledTimes(1);
  });

  it('denies through the transport and closes the popup', async () => {
    render(<DWebConnectPage />);

    const deny = await screen.findByRole('button', { name: 'Deny' });
    fireEvent.click(deny);

    expect(mocks.transport.deny).toHaveBeenCalledTimes(1);
    expect(mocks.approvePopupConnectRequest).not.toHaveBeenCalled();
    expect(window.close).toHaveBeenCalled();
    expect(mocks.publishWalletEvent).toHaveBeenCalledWith(expect.objectContaining({
      _tag   : 'connect.denied',
      origin : 'https://app.example',
    }));
  });

  it('denies and shows an error when the ceremony fails', async () => {
    mocks.approvePopupConnectRequest.mockRejectedValue(
      new Error('Could not send permission grant to any DWN endpoint.'),
    );

    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    expect(await screen.findByText(/Could not write the approved permission grants/i)).toBeInTheDocument();
    expect(mocks.transport.deny).toHaveBeenCalledTimes(1);
    expect(mocks.transport.sendResponse).not.toHaveBeenCalled();
  });

  it('denies and shows an error when the request fails wallet preflight', async () => {
    mocks.transport.awaitRequest.mockResolvedValue({
      ...connectRequest(),
      permissionRequests: [{
        ...permissionRequest,
        permissionScopes: [{
          interface : 'Protocols',
          method    : 'Configure',
          protocol  : 'https://example.com/protocols/tasks',
        }],
      }],
    });

    render(<DWebConnectPage />);

    expect(await screen.findByText(/Protocols\.Configure cannot be delegated/i)).toBeInTheDocument();
    expect(mocks.transport.deny).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
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
  });

  it('creates the transport once across strict-mode remounts', async () => {
    // StrictMode double-invokes effects — without the ref guard the page
    // would create two transports and emit two `loaded` beacons.
    render(<StrictMode><DWebConnectPage /></StrictMode>);

    await screen.findByRole('button', { name: 'Approve' });
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
  });

  it('rejects a hostile session lifetime at arrival and denies without crashing', async () => {
    mocks.transport.awaitRequest.mockResolvedValue({
      ...connectRequest(),
      requestedSessionTtlSeconds: 0,
    });

    render(<DWebConnectPage />);

    expect(await screen.findByText(/invalid session lifetime/i)).toBeInTheDocument();
    expect(mocks.transport.deny).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('refuses to converse with an untrusted dapp origin', async () => {
    mocks.transport.dappOrigin = 'http://evil.example';

    render(<DWebConnectPage />);

    expect(await screen.findByText(/untrusted origin/i)).toBeInTheDocument();
    // The wallet never posts anything back to the untrusted origin.
    expect(mocks.transport.close).toHaveBeenCalled();
    expect(mocks.transport.deny).not.toHaveBeenCalled();
    expect(mocks.transport.awaitRequest).not.toHaveBeenCalled();
  });

  it('hides identities the requester does not support', async () => {
    mocks.transport.awaitRequest.mockResolvedValue({
      ...connectRequest(),
      supportedDidMethods: ['did:jwk'],
    });

    render(<DWebConnectPage />);

    // Alice is did:dht — filtered out, so approval is impossible.
    expect(await screen.findByText(/No identities found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  it('keeps the delivered success when event publication fails', async () => {
    mocks.publishWalletEvent.mockReturnValue(Effect.fail(new Error('analytics down')));

    render(<DWebConnectPage />);

    const approve = await screen.findByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);

    await waitFor(() => {
      expect(mocks.transport.sendResponse).toHaveBeenCalledWith('sealed-response-jwe');
    });
    // The response was delivered; a failed analytics event must not replace
    // the success screen with an error.
    expect(await screen.findByText('Connected!')).toBeInTheDocument();
  });
});
