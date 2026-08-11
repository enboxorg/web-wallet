import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EnboxAuthProvider, useEnboxAuth } from '../provider';
import { SESSION_VAULT_PASSWORD_KEY, STORAGE_KEYS } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth-store';

const TEST_PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';
const TEST_ENDPOINTS = ['https://dwn.example'];

const TEST_IDENTITY_SYNC_PROTOCOLS = vi.hoisted(() => [
  'https://identity.foundation/protocols/profile',
  'https://identity.foundation/protocols/connect',
]);

const authMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

vi.mock('@enbox/browser', () => ({
  AuthManager: {
    create: authMocks.create,
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryMocks,
}));

vi.mock('../protocols', () => ({
  IDENTITY_SYNC_PROTOCOLS: TEST_IDENTITY_SYNC_PROTOCOLS,
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
      getDwnEndpoints: vi.fn().mockResolvedValue(TEST_ENDPOINTS),
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
  let isLocked = state === 'locked';
  const auth = {
    state,
    agent,
    connect: vi.fn(),
    connectVault: vi.fn(async () => {
      isLocked = false;
      return { agent, recoveryPhrase: TEST_PHRASE };
    }),
    restoreFromPhrase: vi.fn(async () => {
      isLocked = false;
      return { agent };
    }),
    restoreSession: vi.fn(),
    lock: vi.fn(async () => {
      isLocked = true;
    }),
    shutdown: vi.fn(async () => {}),
    setLocked: (locked: boolean) => {
      isLocked = locked;
    },
  };
  Object.defineProperty(auth, 'isLocked', { get: () => isLocked });
  return auth;
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

function SafeConnectButton({ onSettled }: { onSettled?: () => void }) {
  const { connect } = useEnboxAuth();
  return (
    <button
      type="button"
      onClick={() => void connect('1234', TEST_ENDPOINTS).catch(() => {}).finally(onSettled)}
    >
      Connect safely
    </button>
  );
}

function ConcurrentAuthenticationButton() {
  const { connect, restore } = useEnboxAuth();
  return (
    <button
      type="button"
      onClick={() => {
        void connect('1234', TEST_ENDPOINTS).catch(() => {});
        void restore(TEST_PHRASE, '1234').catch(() => {});
      }}
    >
      Authenticate twice
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

function RestoreButton({ dwnEndpoints }: { dwnEndpoints?: string[] }) {
  const { restore } = useEnboxAuth();

  return (
    <button
      type="button"
      onClick={() => restore(
        TEST_PHRASE,
        '1234',
        dwnEndpoints,
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
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      initialized: false,
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
        password     : '1234',
        dwnEndpoints : TEST_ENDPOINTS,
      });
    });
    expect(auth.connect).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS)!)).toEqual({
      version: 1,
      endpoints: TEST_ENDPOINTS,
    });
  });

  it('rejects a concurrent auth action without tearing down the active attempt', async () => {
    const user = userEvent.setup();
    const auth = createAuth();
    let releaseConnect!: () => void;
    auth.connectVault.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        releaseConnect = resolve;
      });
      return { agent: auth.agent, recoveryPhrase: TEST_PHRASE };
    });
    authMocks.create.mockResolvedValue(auth);
    sessionStorage.setItem(SESSION_VAULT_PASSWORD_KEY, 'preserved');

    render(
      <EnboxAuthProvider>
        <ConcurrentAuthenticationButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Authenticate twice' }));
    await waitFor(() => expect(auth.connectVault).toHaveBeenCalledOnce());

    expect(auth.restoreFromPhrase).not.toHaveBeenCalled();
    expect(auth.lock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_VAULT_PASSWORD_KEY)).toBe('preserved');

    releaseConnect();
    await waitFor(() => expect(useAuthStore.getState().agent).toBe(auth.agent));
    expect(sessionStorage.getItem(SESSION_VAULT_PASSWORD_KEY)).toBe('1234');
  });

  it('does not re-register the agent or identities when unlocking', async () => {
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
    auth.agent.identity.getDwnEndpoints.mockImplementation(
      async ({ didUri }: { didUri: string }) => endpointsByDid[didUri],
    );
    auth.restoreSession.mockResolvedValue({ agent: auth.agent });
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <UnlockButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(auth.restoreSession).toHaveBeenCalledOnce());
    expect(auth.agent.identity.list).not.toHaveBeenCalled();
    expect(auth.agent.identity.getDwnEndpoints).toHaveBeenCalledOnce();
    expect(auth.agent.identity.getDwnEndpoints).toHaveBeenCalledWith({
      didUri: auth.agent.agentDid.uri,
    });
  });

  it('configures scoped sync at the SDK default settle-check cadence', async () => {
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <div />
      </EnboxAuthProvider>,
    );

    await waitFor(() => {
      const [options] = authMocks.create.mock.calls[0];
      expect(options).toEqual(expect.objectContaining({
        identitySyncProtocols: TEST_IDENTITY_SYNC_PROTOCOLS,
        registration: expect.objectContaining({ persistTokens: true }),
      }));
      expect(options).not.toHaveProperty('sync');
    });
  });

  it('shuts down its AuthManager when unmounted', async () => {
    const auth = createAuth();
    authMocks.create.mockResolvedValue(auth);

    const view = render(
      <EnboxAuthProvider>
        <div />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(useAuthStore.getState().initialized).toBe(true));
    useAuthStore.getState().setUnlocked(auth.agent);
    view.unmount();

    await waitFor(() => expect(auth.shutdown).toHaveBeenCalledOnce());
    expect(useAuthStore.getState()).toMatchObject({
      agent       : null,
      initialized : false,
    });
  });

  it('does not publish an agent after unmount during endpoint resolution', async () => {
    const user = userEvent.setup();
    const auth = createAuth();
    const settled = vi.fn();
    let resolveEndpoints!: (endpoints: string[]) => void;
    auth.agent.identity.getDwnEndpoints.mockReturnValue(new Promise((resolve) => {
      resolveEndpoints = resolve;
    }));
    authMocks.create.mockResolvedValue(auth);

    const view = render(
      <EnboxAuthProvider>
        <SafeConnectButton onSettled={settled} />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(useAuthStore.getState().initialized).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Connect safely' }));
    await waitFor(() => expect(auth.agent.identity.getDwnEndpoints).toHaveBeenCalledOnce());

    view.unmount();
    resolveEndpoints(TEST_ENDPOINTS);

    await waitFor(() => expect(settled).toHaveBeenCalledOnce());
    expect(auth.shutdown).toHaveBeenCalledOnce();
    expect(auth.lock).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      agent       : null,
      initialized : false,
    });
    expect(sessionStorage.getItem(SESSION_VAULT_PASSWORD_KEY)).toBeNull();
    expect(queryMocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it('shuts down an AuthManager that finishes creating after unmount', async () => {
    const auth = createAuth();
    let resolveCreate!: (value: typeof auth) => void;
    authMocks.create.mockReturnValue(new Promise((resolve) => {
      resolveCreate = resolve;
    }));

    const view = render(
      <EnboxAuthProvider>
        <div />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalledOnce());
    view.unmount();
    resolveCreate(auth);

    await waitFor(() => expect(auth.shutdown).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().initialized).toBe(false);
  });

  it('shows the validated cache without treating it as endpoint authority', async () => {
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
      expect(authMocks.create).toHaveBeenCalledOnce();
    });
    expect(authMocks.create.mock.calls[0][0]).not.toHaveProperty('dwnEndpoints');
    expect(screen.getByText(cachedEndpoints[0])).toBeInTheDocument();
  });

  it('replaces the cache with signed agent DID endpoints after session restore', async () => {
    const signedEndpoints = ['https://signed-agent.example/dwn'];
    const auth = createAuth('locked');
    auth.agent.agentDid.document.service[0].serviceEndpoint = ['https://portable-snapshot.example/dwn'];
    auth.agent.identity.getDwnEndpoints.mockResolvedValue(signedEndpoints);
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

  it('relocks a vault unlocked by an incomplete automatic restore', async () => {
    const auth = createAuth('locked');
    auth.restoreSession.mockImplementation(async () => {
      auth.setLocked(false);
      return undefined;
    });
    authMocks.create.mockResolvedValue(auth);
    sessionStorage.setItem(SESSION_VAULT_PASSWORD_KEY, '1234');

    render(
      <EnboxAuthProvider>
        <div />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(auth.lock).toHaveBeenCalledOnce());
    expect(auth.isLocked).toBe(true);
    expect(sessionStorage.getItem(SESSION_VAULT_PASSWORD_KEY)).toBeNull();
    expect(useAuthStore.getState().agent).toBeNull();
  });

  it('passes selected recovery endpoints to the SDK and retains signed agent defaults', async () => {
    const signedEndpoints = ['https://signed-agent.example/dwn'];
    const user = userEvent.setup();
    const auth = createAuth('locked');
    auth.agent.agentDid.document.service[0].serviceEndpoint = ['https://portable-snapshot.example/dwn'];
    auth.agent.identity.getDwnEndpoints.mockResolvedValue(signedEndpoints);
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <RestoreButton dwnEndpoints={TEST_ENDPOINTS} />
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
    auth.agent.identity.getDwnEndpoints.mockRejectedValue(
      new Error('Agent DID does not contain a DWN service.'),
    );
    authMocks.create.mockResolvedValue(auth);

    render(
      <EnboxAuthProvider>
        <SafeConnectButton />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Connect safely' }));

    await waitFor(() => expect(auth.lock).toHaveBeenCalledOnce());
    expect(useAuthStore.getState().agent).toBeNull();
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
        password       : '1234',
        recoveryPhrase : TEST_PHRASE,
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
    expect(localStorage.getItem('enbox:enbox:auth:previouslyConnected')).toBe('true');
  });
});
