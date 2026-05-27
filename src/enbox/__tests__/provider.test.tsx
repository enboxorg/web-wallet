import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EnboxAuthProvider, useEnboxAuth } from '../provider';
import { STORAGE_KEYS, SESSION_PIN_KEY } from '@/lib/constants';
import { useAuthStore } from '@/stores/auth-store';

const TEST_PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';
const TEST_ENDPOINTS = ['https://dwn.example'];

const authMocks = vi.hoisted(() => ({
  create: vi.fn(),
  requestLocalDwnDiscovery: vi.fn(),
}));

vi.mock('@enbox/auth', () => ({
  AuthManager: {
    create: authMocks.create,
  },
  requestLocalDwnDiscovery: authMocks.requestLocalDwnDiscovery,
}));

function createAgent() {
  return {
    agentDid: {
      uri: 'did:example:agent',
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

describe('EnboxAuthProvider restore flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        password     : '1234',
        dwnEndpoints : TEST_ENDPOINTS,
      });
    });
    expect(auth.connect).not.toHaveBeenCalled();
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
        dwnEndpoints   : TEST_ENDPOINTS,
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
    expect(sessionStorage.getItem(SESSION_PIN_KEY)).toBe('1234');
    expect(localStorage.getItem('enbox:enbox:auth:previouslyConnected')).toBe('true');
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_DWN_ENDPOINT)).toBe('http://127.0.0.1:55500');
  });
});
