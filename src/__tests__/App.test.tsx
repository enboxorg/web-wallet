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
  },
  connect: vi.fn(),
  unlock: vi.fn(),
  restore: vi.fn(),
  lock: vi.fn(),
  setPhrase: vi.fn(),
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

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useCreateIdentity: () => ({ mutateAsync: vi.fn() }),
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

function renderApp() {
  return render(
    <MemoryRouter>
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
    mocks.restore.mockResolvedValue(undefined);
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
});
