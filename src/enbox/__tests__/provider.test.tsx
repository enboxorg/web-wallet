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
    connectVault: vi.fn().mockResolvedValue({ agent }),
    restoreSession: vi.fn(),
    lock: vi.fn().mockResolvedValue(undefined),
  };
}

function RestoreButton({ resetLocalVault = false }: { resetLocalVault?: boolean }) {
  const { restore } = useEnboxAuth();

  return (
    <button
      type="button"
      onClick={() => restore(
        TEST_PHRASE,
        '1234',
        TEST_ENDPOINTS,
        resetLocalVault ? { resetLocalVault: true } : undefined,
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

  it('uses explicit vault restore instead of generic connect', async () => {
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
      expect(auth.connectVault).toHaveBeenCalledWith({
        password       : '1234',
        recoveryPhrase : TEST_PHRASE,
        dwnEndpoints   : TEST_ENDPOINTS,
      });
    });
    expect(auth.connect).not.toHaveBeenCalled();
  });

  it('resets local vault state before forgot-PIN phrase restore', async () => {
    const user = userEvent.setup();
    const auth = createAuth('locked');
    authMocks.create.mockResolvedValue(auth);
    localStorage.setItem('enbox:enbox:auth:previouslyConnected', 'true');
    sessionStorage.setItem(SESSION_PIN_KEY, '0000');

    render(
      <EnboxAuthProvider>
        <RestoreButton resetLocalVault />
      </EnboxAuthProvider>,
    );

    await waitFor(() => expect(authMocks.create).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(auth.connectVault).toHaveBeenCalled());
    expect(auth.agent.sync.stopSync).toHaveBeenCalledWith(2_000);
    expect(auth.agent.sync.clear).toHaveBeenCalled();
    expect(auth.agent.dwn.clearDelegateDecryptionKeys).toHaveBeenCalled();
    expect(auth.agent.vault.lock).toHaveBeenCalled();
    expect(auth.agent.vault._store.clear).toHaveBeenCalled();
    expect(auth.agent.secrets._store.clear).toHaveBeenCalled();
    expect(sessionStorage.getItem(SESSION_PIN_KEY)).toBe('1234');
    expect(localStorage.getItem('enbox:enbox:auth:previouslyConnected')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_DWN_ENDPOINT)).toBe('http://127.0.0.1:55500');
  });
});
