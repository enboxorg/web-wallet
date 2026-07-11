import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import App from '../App';

const mocks = vi.hoisted(() => ({
  authState: {
    initialized : true,
    unlocked    : false,
    firstTime   : false,
    agent       : null,
    dwnEndpoints: ['https://wallet-default.example/dwn'],
  },
  connect: vi.fn(),
  unlock: vi.fn(),
  restore: vi.fn(),
  lock: vi.fn(),
  setPhrase: vi.fn(),
  createIdentity: vi.fn(),
}));

vi.mock('@/enbox/provider', () => ({
  EnboxAuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/enbox/hooks/use-auth', () => ({
  useAuth: () => ({
    ...mocks.authState,
    connect   : mocks.connect,
    unlock    : mocks.unlock,
    restore   : mocks.restore,
    lock      : mocks.lock,
    error     : null,
    isLoading : false,
  }),
}));

vi.mock('@/enbox/hooks/use-identities', () => ({
  useIdentities: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/enbox/hooks/use-identity-sync-reconciliation', () => ({
  useIdentitySyncReconciliation: vi.fn(),
}));

vi.mock('@/enbox/hooks/use-sync-query-invalidation', () => ({
  useSyncQueryInvalidation: vi.fn(),
}));

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useCreateIdentity: () => ({ mutateAsync: mocks.createIdentity }),
}));

vi.mock('@/features/auth/SetupIdentityStep', () => ({
  SetupIdentityStep: ({
    onCreateIdentity,
  }: {
    onCreateIdentity: (params: { displayName: string; avatar: Blob; hero: Blob }) => Promise<void>;
  }) => (
    <button
      type="button"
      onClick={() => onCreateIdentity({
        displayName: 'Alice',
        avatar: new Blob(['avatar']),
        hero: new Blob(['hero']),
      })}
    >
      Create first identity
    </button>
  ),
}));

vi.mock('@/stores/backup-seed-store', () => ({
  useBackupSeedStore: (selector: (state: { phrase: string | null; setPhrase: (phrase: string) => void }) => unknown) =>
    selector({ phrase: null, setPhrase: mocks.setPhrase }),
}));

vi.mock('@/features/auth/UnlockScreen', () => ({
  UnlockScreen: ({ onForgotPin }: { onForgotPin: () => void }) => (
    <section>
      <h1>Unlock Mock</h1>
      <button type="button" onClick={onForgotPin}>
        Forgot PIN
      </button>
    </section>
  ),
}));

vi.mock('@/features/auth/RestoreWalletPage', () => ({
  RestoreWalletPage: ({
    onRestore,
  }: {
    onRestore: (phrase: string, pin: string, dwnEndpoints: string[]) => Promise<void>;
  }) => (
    <section>
      <h1>Restore Mock</h1>
      <button
        type="button"
        onClick={() => onRestore(
          'abandon ability able about above absent absorb abstract absurd abuse access accident',
          '1234',
          ['https://dwn.example'],
        )}
      >
        Complete restore
      </button>
    </section>
  ),
}));

vi.mock('@/features/auth/SetupScreen', () => ({
  SetupScreen: ({ onSwitchToRestore }: { onSwitchToRestore: () => void }) => (
    <section>
      <h1>Setup Mock</h1>
      <button type="button" onClick={onSwitchToRestore}>
        Switch restore
      </button>
    </section>
  ),
}));

vi.mock('@/features/connect/DWebConnectPage', () => ({
  default: () => <h1>DWeb Connect Mock</h1>,
}));

function renderApp(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App auth restore flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authState.initialized = true;
    mocks.authState.unlocked = false;
    mocks.authState.firstTime = false;
    mocks.authState.agent = null;
    mocks.authState.dwnEndpoints = ['https://wallet-default.example/dwn'];
    mocks.restore.mockResolvedValue(undefined);
    mocks.createIdentity.mockResolvedValue({ did: { uri: 'did:dht:alice' } });
  });

  it('clears forgot-PIN mode after successful phrase restore', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Forgot PIN' }));
    expect(screen.getByRole('heading', { name: 'Restore Mock' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Complete restore' }));

    await waitFor(() => {
      expect(mocks.restore).toHaveBeenCalledWith(
        'abandon ability able about above absent absorb abstract absurd abuse access accident',
        '1234',
        ['https://dwn.example'],
      );
    });
    expect(screen.getByRole('heading', { name: 'Unlock Mock' })).toBeInTheDocument();
  });

  it('renders DWeb Connect before empty-wallet identity onboarding', async () => {
    mocks.authState.unlocked = true;
    mocks.authState.agent = { agentDid: { uri: 'did:dht:agent' } } as never;

    renderApp('/dweb-connect');

    expect(await screen.findByRole('heading', { name: 'DWeb Connect Mock' })).toBeInTheDocument();
    expect(screen.queryByText(/new profile/i)).not.toBeInTheDocument();
  });

  it('seeds the first identity with the wallet endpoint selection', async () => {
    const user = userEvent.setup();
    mocks.authState.unlocked = true;
    mocks.authState.agent = { agentDid: { uri: 'did:dht:agent' } } as never;

    renderApp();
    await user.click(screen.getByRole('button', { name: 'Create first identity' }));

    expect(mocks.createIdentity).toHaveBeenCalledWith(expect.objectContaining({
      dwnEndpoints: ['https://wallet-default.example/dwn'],
    }));
  });
});
