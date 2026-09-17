import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RECOVERY_PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

const passkeyMocks = vi.hoisted(() => ({
  canCreatePasskeyVault: vi.fn(() => false),
  createPasskeyVault: vi.fn(),
  isPasskeyVaultUnsupportedError: vi.fn((_error: unknown) => false),
  markPinAuthMethod: vi.fn(),
}));

vi.mock('@/lib/passkeys', () => ({
  canCreatePasskeyVault: passkeyMocks.canCreatePasskeyVault,
  createPasskeyVault: passkeyMocks.createPasskeyVault,
  isPasskeyVaultUnsupportedError: passkeyMocks.isPasskeyVaultUnsupportedError,
  markPinAuthMethod: passkeyMocks.markPinAuthMethod,
}));

vi.mock('@/components/ui/SeedPhraseInput', () => ({
  SeedPhraseInput: ({ onSubmit }: { onSubmit: (phrase: string) => void }) => (
    <button type="button" onClick={() => onSubmit(RECOVERY_PHRASE)}>
      Submit phrase
    </button>
  ),
}));

vi.mock('@/components/ui/EndpointHealth', () => ({
  EndpointHealth: ({ url }: { url: string }) => <span>{url}</span>,
}));

import { RestoreWalletPage } from '../RestoreWalletPage';

describe('RestoreWalletPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    passkeyMocks.canCreatePasskeyVault.mockReturnValue(false);
  });

  function enterPin(pin: string): void {
    fireEvent.paste(screen.getAllByRole('textbox')[0], {
      clipboardData: { getData: () => pin },
    });
  }

  it('restores from the signed DID document without an endpoint override by default', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RestoreWalletPage onRestore={onRestore} isLoading={false} error={null} />);

    await user.click(screen.getByRole('button', { name: 'Submit phrase' }));
    expect(screen.getByText('Recovery DWN Endpoints')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'DWN endpoint 1' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    enterPin('2468');
    await screen.findByText('Confirm PIN');
    enterPin('2468');

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith(RECOVERY_PHRASE, '2468', undefined);
    });
  });

  it('restores through one custom recovery endpoint', async () => {
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RestoreWalletPage onRestore={onRestore} isLoading={false} error={null} />);

    await user.click(screen.getByRole('button', { name: 'Submit phrase' }));
    expect(screen.getByText('Recovery DWN Endpoints')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enter replacement endpoints' }));
    await user.click(screen.getByRole('button', { name: 'Remove DWN endpoint 2' }));
    const endpoint = screen.getByRole('textbox', { name: 'DWN endpoint 1' });
    await user.clear(endpoint);
    await user.type(endpoint, 'https://recovery.example/dwn/');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    enterPin('2468');
    await screen.findByText('Confirm PIN');
    enterPin('2468');

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith(
        RECOVERY_PHRASE,
        '2468',
        ['https://recovery.example/dwn/'],
      );
    });
    expect(passkeyMocks.markPinAuthMethod).toHaveBeenCalledOnce();
  });

  it('does not continue without a recovery endpoint', async () => {
    const user = userEvent.setup();
    render(<RestoreWalletPage onRestore={vi.fn()} isLoading={false} error={null} />);

    await user.click(screen.getByRole('button', { name: 'Submit phrase' }));
    await user.click(screen.getByRole('button', { name: 'Enter replacement endpoints' }));
    await user.click(screen.getByRole('button', { name: 'Remove DWN endpoint 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove DWN endpoint 1' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one DWN endpoint');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('skips endpoint selection when the existing vault is only resetting its PIN', async () => {
    const user = userEvent.setup();
    render(
      <RestoreWalletPage
        onRestore={vi.fn()}
        isLoading={false}
        error={null}
        allowEndpointSelection={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit phrase' }));

    expect(screen.queryByText('Recovery DWN Endpoints')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create PIN' })).toBeInTheDocument();
  });

  it('offers passkey restore from the synchronous runtime check', async () => {
    passkeyMocks.canCreatePasskeyVault.mockReturnValue(true);
    passkeyMocks.createPasskeyVault.mockImplementation(
      async (activate) => activate('wrapped-vault-password'),
    );
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <RestoreWalletPage
        onRestore={onRestore}
        isLoading={false}
        error={null}
        allowEndpointSelection={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit phrase' }));
    await user.click(screen.getByRole('button', { name: /Use passkey/i }));

    await waitFor(() => {
      expect(onRestore).toHaveBeenCalledWith(
        RECOVERY_PHRASE,
        'wrapped-vault-password',
        undefined,
      );
    });
    expect(passkeyMocks.createPasskeyVault).toHaveBeenCalledWith(expect.any(Function));
  });

  it('falls back without offering an unsupported passkey again', async () => {
    const unsupportedError = new Error('Passkey provider cannot wrap this vault.');
    passkeyMocks.canCreatePasskeyVault.mockReturnValue(true);
    passkeyMocks.createPasskeyVault.mockRejectedValue(unsupportedError);
    passkeyMocks.isPasskeyVaultUnsupportedError.mockImplementation(
      (error) => error === unsupportedError,
    );
    const user = userEvent.setup();
    render(
      <RestoreWalletPage
        onRestore={vi.fn()}
        isLoading={false}
        error={null}
        allowEndpointSelection={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit phrase' }));
    await user.click(screen.getByRole('button', { name: /Use passkey/i }));

    expect(await screen.findByRole('heading', { name: 'Create PIN' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Submit phrase' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use passkey/i })).not.toBeInTheDocument();
  });
});
