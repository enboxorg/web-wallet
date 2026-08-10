import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RECOVERY_PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

const passkeyMocks = vi.hoisted(() => ({
  canCheckPasskeySupport: vi.fn(() => false),
  isPasskeySupported: vi.fn().mockResolvedValue(false),
  isPasskeyVaultUnsupportedError: vi.fn(() => false),
  markPinAuthMethod: vi.fn(),
  preparePasskeyVaultPassword: vi.fn(),
  storePasskeyCredential: vi.fn(),
}));

vi.mock('@/lib/passkeys', () => ({
  canCheckPasskeySupport: passkeyMocks.canCheckPasskeySupport,
  isPasskeySupported: passkeyMocks.isPasskeySupported,
  isPasskeyVaultUnsupportedError: passkeyMocks.isPasskeyVaultUnsupportedError,
  markPinAuthMethod: passkeyMocks.markPinAuthMethod,
  preparePasskeyVaultPassword: passkeyMocks.preparePasskeyVaultPassword,
  storePasskeyCredential: passkeyMocks.storePasskeyCredential,
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
    passkeyMocks.canCheckPasskeySupport.mockReturnValue(false);
    passkeyMocks.isPasskeySupported.mockResolvedValue(false);
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
});
