import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EnboxAuthProvider, useEnboxAuth } from '../provider';
import { SESSION_PIN_KEY, SESSION_VAULT_PASSWORD_KEY, STORAGE_KEYS } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth-store';

const TEST_PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';
const TEST_ENDPOINTS = ['https://dwn.example'];

const TEST_IDENTITY_SYNC_PROTOCOLS = vi.hoisted(() => [
  'https://identity.foundation/protocols/social-graph',
  'https://identity.foundation/protocols/profile',
  'https://identity.foundation/protocols/connect',
]);

const authMocks = vi.hoisted(() => ({
  create: vi.fn(),
  requestLocalDwnDiscovery: vi.fn(),
}));
const registrationMocks = vi.hoisted(() => ({
  ensureRegistrationForDids: vi.fn(),
}));

vi.mock('@enbox/auth', () => ({
  AuthManager: {
    create: authMocks.create,
  },
  requestLocalDwnDiscovery: authMocks.requestLocalDwnDiscovery,
}));

vi.mock('../protocols', () => ({
  IDENTITY_SYNC_PROTOCOLS: TEST_IDENTITY_SYNC_PROTOCOLS,
}));

vi.mock('../registration', () => ({
  ensureRegistrationForDids: registrationMocks.ensureRegistrationForDids,
}));

function createAgent() {
  const agentDidUri = 'did:example:agent';
  return {
    agentDid: {
      uri: agentDidUri,
      document: {
        service: [{
          id: `${agentDidUri}#dwn`,
          type: 'DecentralizedWebNode',
          serviceEndpoint: TEST_ENDPOINTS,
        }],
      },
    },
    identity: {
      list: vi.fn().mockResolvedValue([]),
    },
    rpc: {
      getServerInfo: vi.fn().mockRejectedValue(new Error('offline')),
    },
    sync: {
      stopSync: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    dwn: {
      clearDelegateDecryptionKeys: vi.fn(),
      getRemoteDwnEndpointUrls: vi.fn().mockResolvedValue(TEST_ENDPOINTS),
    },
    vault: {
      lock: vi.fn().mockResolvedValue(undefined),
      _store: {
        clear: vi.fn().mockResolvedValue(undefined),
      },
    },
    secrets: {
      _store: {
        clear: vi.fn().mockResolvedValue(undefined),
      },
    },
  };
}

function createAuth(state: 'uninitialized' | 'locked' = 'uninitialized') {
  const agent = createAgent();
  return {
    state,
    agent,
    connect: vi.fn(),
    connectVault: vi.fn().mockResolvedValue({ agent, recoveryPhrase: TEST_PHRASE }),
    restoreFromPhrase: vi.fn().mockResolvedValue({ agent }),
    restoreSession: vi.fn(),
    lock: vi.fn().mockResolvedValue(undefined),
  };
}

function ConnectButton() {
  const { connect } = useEnboxAuth();

  return (
    <button
      type="button"
      onClick={() => connect('1234', TEST_ENDPOINTS)}
    >
      Connect
    </button>
  );
}

function DoubleConnectButton() {
  const { connect } = useEnboxAuth();

  return (
    <button
      type="button"
      onClick={() => {
        void connect('1234', TEST_ENDPOINTS).catch(() => {});
        void connect('1234', TEST_ENDPOINTS).catch(() => {});
      }}
    >
      Double Connect
    </button>
  );
}

function SafeConnectButton() {
  const { connect } = useEnboxAuth();
  return (
    <button type="button" onClick={() => void connect('1234', TEST_ENDPOINTS).catch(() => {})}>
      Connect safely
    </button>
  );
}

function UnlockButton() {
  const { unlock } = useEnboxAuth();
  return (
    <button type="button" onClick={() => void unlock('1234').catch(() => {})}>
      Unlock
    </button>
  );
}

function RestoreButton() {
  const { restore } = useEnboxAuth();

  return (
    <button
      type="button"
      onClick={() => restore(
        TEST_PHRASE,
        '1234',
        TEST_ENDPOINTS,
      )}
    >
      Restore
    </button>
  );
}

function EndpointProbe() {
  const { dwnEndpoints } = useEnboxAuth();
  return <span>{dwnEndpoints.join(',')}</span>;
}

describe('EnboxAuthProvider restore flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registrationMocks.ensureRegistrationForDids.mockResolvedValue(undefined);
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(STORAGE_KEYS.LOCAL_DWN_ENDPOINT, 'http://127.0.0.1:55500');
    useAuthStore.setState({
      initialized: false,
      unlocked: false,
      firstTime: false,
      agent: null,
    });
  });

  it('uses explicit vault connect for first-time setup', async () => {
    const user = userEvent.setup();
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <ConnectButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(auth.connectVault).toHaveBeenCalledWith({
        password              : '1234',
        dwnEndpoints          : TEST_ENDPOINTS,
        identitySyncProtocols : TEST_IDENTITY_SYNC_PROTOCOLS,
      });
    });
    expect(auth.connect).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS)!)).toEqual({
      version: 1,
      endpoints: TEST_ENDPOINTS,
    });
    expect(registrationMocks.ensureRegistrationForDids).not.toHaveBeenCalled();
  });

  it('registers each DID only with the endpoints advertised for that DID', async () => {
    const user = userEvent.setup();
    const auth = createAuth('locked');
    const ownerDid = 'did:dht:owner';
    const connectedDid = 'did:dht:connected-owner';
    const endpointsByDid: Record<string, string[]> = {
      [auth.agent.agentDid.uri] : ['https://agent.example/dwn'],
      [ownerDid]                : ['https://owner.example/dwn'],
      [connectedDid]            : ['https://connected.example/dwn'],
    };
    auth.agent.identity.list.mockResolvedValue([
      { did: { uri: ownerDid }, metadata: {} },
      { did: { uri: 'did:jwk:delegate' }, metadata: { connectedDid } },
    ]);
    auth.agent.dwn.getRemoteDwnEndpointUrls.mockImplementation(async (did: string) => endpointsByDid[did]);
    auth.restoreSession.mockResolvedValue({ agent: auth.agent });
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <UnlockButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(registrationMocks.ensureRegistrationForDids).toHaveBeenCalledTimes(3));
    for (const [did, endpoints] of Object.entries(endpointsByDid)) {
      expect(registrationMocks.ensureRegistrationForDids).toHaveBeenCalledWith(
        auth.agent,
        endpoints,
        [did],
      );
    }
  });

  it('coalesces duplicate first-time setup calls into one vault operation', async () => {
    const user = userEvent.setup();
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <DoubleConnectButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Double Connect' }));

    await waitFor(() => {
      expect(auth.connectVault).toHaveBeenCalledTimes(1);
    });
  });

  it('configures wallet identity protocol sync for auth-managed recovery', async () => {
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <div />
      </EnboxAuthProvider>,
    );

    await waitFor(() => {
      expect(authMocks.create).toHaveBeenCalledWith(expect.objectContaining({
        identitySyncProtocols: TEST_IDENTITY_SYNC_PROTOCOLS,
        registration: expect.objectContaining({ persistTokens: true }),
      }));
    });
  });

  it('uses the validated pre-unlock cache when creating the auth manager', async () => {
    const cachedEndpoints = ['https://actor-a.example/dwn'];
    localStorage.setItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS, JSON.stringify({
      version: 1,
      endpoints: cachedEndpoints,
    }));
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <EndpointProbe />
      </EnboxAuthProvider>,
    );

    await waitFor(() => {
      expect(authMocks.create).toHaveBeenCalledWith(expect.objectContaining({
        dwnEndpoints: cachedEndpoints,
      }));
    });
    expect(screen.getByText(cachedEndpoints[0])).toBeInTheDocument();
  });

  it('replaces the cache with signed agent DID endpoints after session restore', async () => {
    const signedEndpoints = ['https://signed-agent.example/dwn'];
    const auth = createAuth('locked');
    auth.agent.agentDid.document.service[0].serviceEndpoint = signedEndpoints;
    auth.restoreSession.mockResolvedValue({ agent: auth.agent });
    authMocks.create.mockResolvedValue(auth);
    sessionStorage.setItem(SESSION_VAULT_PASSWORD_KEY, '1234');
    localStorage.setItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS, JSON.stringify({
      version: 1,
      endpoints: ['https://tampered-cache.example/dwn'],
    }));

    render(
      <EnboxAuthProvider>
        <EndpointProbe />
      </EnboxAuthProvider>,
    );

    await screen.findByText(signedEndpoints[0]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS)!)).toEqual({
      version: 1,
      endpoints: signedEndpoints,
    });
  });

  it('passes selected recovery endpoints to the SDK and retains signed agent defaults', async () => {
    const signedEndpoints = ['https://signed-agent.example/dwn'];
    const user = userEvent.setup();
    const auth = createAuth('locked');
    auth.agent.agentDid.document.service[0].serviceEndpoint = signedEndpoints;
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <RestoreButton />
        <EndpointProbe />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await screen.findByText(signedEndpoints[0]);
    expect(auth.restoreFromPhrase).toHaveBeenCalledWith(expect.objectContaining({
      dwnEndpoints: TEST_ENDPOINTS,
    }));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS)!)).toEqual({
      version: 1,
      endpoints: signedEndpoints,
    });
  });

  it('rolls back an SDK session when the stored agent DID service is malformed', async () => {
    const user = userEvent.setup();
    const auth = createAuth();
    auth.agent.agentDid.document.service = [];
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <SafeConnectButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Connect safely' }));

    await waitFor(() => expect(auth.lock).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().unlocked).toBe(false);
  });

  it('uses restoreFromPhrase instead of generic connect', async () => {
    const user = userEvent.setup();
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <RestoreButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(auth.restoreFromPhrase).toHaveBeenCalledWith({
        password              : '1234',
        recoveryPhrase        : TEST_PHRASE,
        dwnEndpoints          : TEST_ENDPOINTS,
        identitySyncProtocols : TEST_IDENTITY_SYNC_PROTOCOLS,
      });
    });
    expect(auth.connect).not.toHaveBeenCalled();
    expect(auth.connectVault).not.toHaveBeenCalled();
  });

  it('lets the SDK reset the local vault password for forgot-PIN phrase restore', async () => {
    const user = userEvent.setup();
    const auth = createAuth('locked');
    authMocks.create.mockResolvedValue(auth);
    localStorage.setItem('enbox:enbox:auth:previouslyConnected', 'true');
    sessionStorage.setItem(SESSION_PIN_KEY, '0000');

    render(
      <EnboxAuthProvider>
        <RestoreButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(auth.restoreFromPhrase).toHaveBeenCalled());
    expect(auth.agent.sync.stopSync).not.toHaveBeenCalled();
    expect(auth.agent.sync.clear).not.toHaveBeenCalled();
    expect(auth.agent.dwn.clearDelegateDecryptionKeys).not.toHaveBeenCalled();
    expect(auth.agent.vault.lock).not.toHaveBeenCalled();
    expect(auth.agent.vault._store.clear).not.toHaveBeenCalled();
    expect(auth.agent.secrets._store.clear).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_VAULT_PASSWORD_KEY)).toBe('1234');
    expect(sessionStorage.getItem(SESSION_PIN_KEY)).toBeNull();
    expect(localStorage.getItem('enbox:enbox:auth:previouslyConnected')).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_DWN_ENDPOINT)).toBe('http://127.0.0.1:55500');
  });
});
