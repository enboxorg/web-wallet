import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const passkeyMocks = vi.hoisted(() => ({
  createPasskeyVault: vi.fn(),
  isPasskeyVaultUnsupportedError: vi.fn((_error: unknown) => false),
  markPinAuthMethod: vi.fn(),
}));

vi.mock('@/lib/passkeys', () => ({
  createPasskeyVault: passkeyMocks.createPasskeyVault,
  isPasskeyVaultUnsupportedError: passkeyMocks.isPasskeyVaultUnsupportedError,
  markPinAuthMethod: passkeyMocks.markPinAuthMethod,
}));

vi.mock('@/components/ui/EndpointHealth', () => ({
  EndpointHealth: ({ url }: { url: string }) => <span>{url}</span>,
}));

import { WelcomeScreen } from '../WelcomeScreen';
import { JUST_ONBOARDED_KEY } from '@/lib/auto-identity';

describe('WelcomeScreen', () => {
  const defaults = {
    onSetup: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
  };

  function enterPin(digits: string) {
    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => digits },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    passkeyMocks.createPasskeyVault.mockRejectedValue(
      new Error('Passkeys are not available on this device.'),
    );
    passkeyMocks.isPasskeyVaultUnsupportedError.mockReturnValue(true);
  });

  it('renders the one-tap create action', () => {
    render(<WelcomeScreen {...defaults} />);
    expect(screen.getByText('Own your identity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create my wallet/i })).toBeInTheDocument();
  });

  it('creates the vault with a passkey-wrapped password in one tap', async () => {
    passkeyMocks.isPasskeyVaultUnsupportedError.mockReturnValue(false);
    passkeyMocks.createPasskeyVault.mockImplementation(
      async (activate) => activate('wrapped-vault-password'),
    );
    const onSetup = vi.fn().mockResolvedValue('seed phrase words');
    render(<WelcomeScreen {...defaults} onSetup={onSetup} />);

    await userEvent.click(screen.getByRole('button', { name: /create my wallet/i }));

    await waitFor(() => {
      expect(onSetup).toHaveBeenCalledWith('wrapped-vault-password', expect.any(Array));
    });
    expect(passkeyMocks.createPasskeyVault).toHaveBeenCalledWith(expect.any(Function));
    // The just-onboarded flag drives automatic first-identity creation.
    expect(sessionStorage.getItem(JUST_ONBOARDED_KEY)).toBe('1');
  });

  it('falls back to PIN create + confirm when passkeys are unavailable', async () => {
    render(<WelcomeScreen {...defaults} />);

    await userEvent.click(screen.getByRole('button', { name: /create my wallet/i }));

    expect(await screen.findByText('Create a PIN')).toBeInTheDocument();
    enterPin('1234');

    expect(await screen.findByText('Confirm your PIN')).toBeInTheDocument();
    enterPin('1234');

    await waitFor(() => {
      expect(defaults.onSetup).toHaveBeenCalledWith('1234', expect.any(Array));
    });
    expect(passkeyMocks.markPinAuthMethod).toHaveBeenCalled();
  });

  it('rejects a mismatched PIN confirmation', async () => {
    render(<WelcomeScreen {...defaults} />);

    await userEvent.click(screen.getByRole('button', { name: /create my wallet/i }));
    expect(await screen.findByText('Create a PIN')).toBeInTheDocument();
    enterPin('1234');

    expect(await screen.findByText('Confirm your PIN')).toBeInTheDocument();
    enterPin('9999');

    expect(await screen.findByText(/PINs do not match/)).toBeInTheDocument();
    expect(defaults.onSetup).not.toHaveBeenCalled();
  });

  it('offers restore for returning users', async () => {
    const onSwitchToRestore = vi.fn();
    render(<WelcomeScreen {...defaults} onSwitchToRestore={onSwitchToRestore} />);

    await userEvent.click(screen.getByRole('button', { name: /i already have a wallet/i }));
    expect(onSwitchToRestore).toHaveBeenCalled();
  });
});
