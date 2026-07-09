import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

vi.mock('@/components/ui/EndpointHealth', () => ({
  EndpointHealth: ({ url }: { url: string }) => <span>{url}</span>,
}));

import { SetupScreen } from '../SetupScreen';

describe('SetupScreen', () => {
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
    passkeyMocks.canCheckPasskeySupport.mockReturnValue(false);
    passkeyMocks.isPasskeySupported.mockResolvedValue(false);
    passkeyMocks.isPasskeyVaultUnsupportedError.mockReturnValue(false);
  });

  it('renders step 1: create PIN', () => {
    render(<SetupScreen {...defaults} />);
    expect(screen.getByText('Welcome to Enbox')).toBeInTheDocument();
    expect(screen.getByText(/Create a PIN to secure your wallet/)).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('advances to step 2 after entering PIN', async () => {
    render(<SetupScreen {...defaults} />);
    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
      expect(screen.getByText(/Enter your PIN again/)).toBeInTheDocument();
    });
  });

  it('shows error on PIN mismatch in step 2', async () => {
    render(<SetupScreen {...defaults} />);
    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    // Enter a different PIN for confirmation
    enterPin('5678');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('PINs do not match');
    });
  });

  it('advances to step 3 when PINs match', async () => {
    render(<SetupScreen {...defaults} />);
    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByText('DWN Endpoints')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Set up' })).toBeInTheDocument();
    });
  });

  it('shows default DWN endpoints in editable fields', async () => {
    render(<SetupScreen {...defaults} />);
    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'DWN endpoint 1' })).toHaveValue(
        'https://enbox-dwn.fly.dev',
      );
      expect(screen.getByRole('textbox', { name: 'DWN endpoint 2' })).toHaveValue(
        'https://dev.aws.dwn.enbox.id',
      );
    });
  });

  it('calls onSetup with PIN and endpoints on submit', async () => {
    const onSetup = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SetupScreen {...defaults} onSetup={onSetup} />);

    enterPin('4321');

    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('4321');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Set up' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Set up' }));
    expect(onSetup).toHaveBeenCalledWith('4321', expect.any(Array));
    expect(onSetup.mock.calls[0][1]).toContain('https://enbox-dwn.fly.dev');
    expect(passkeyMocks.markPinAuthMethod).toHaveBeenCalledOnce();
  });

  it('can replace the managed endpoints with one custom DWN', async () => {
    const onSetup = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SetupScreen {...defaults} onSetup={onSetup} />);

    enterPin('4321');
    await screen.findByText('Confirm PIN');
    enterPin('4321');
    await screen.findByText('DWN Endpoints');

    await user.click(screen.getByRole('button', { name: 'Remove DWN endpoint 2' }));
    const endpoint = screen.getByRole('textbox', { name: 'DWN endpoint 1' });
    await user.clear(endpoint);
    await user.type(endpoint, 'https://actor-a.example/dwn/');
    await user.click(screen.getByRole('button', { name: 'Set up' }));

    expect(onSetup).toHaveBeenCalledWith('4321', ['https://actor-a.example/dwn/']);
  });

  it('can add another DWN endpoint', async () => {
    const onSetup = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SetupScreen {...defaults} onSetup={onSetup} />);

    enterPin('4321');
    await screen.findByText('Confirm PIN');
    enterPin('4321');
    await screen.findByText('DWN Endpoints');

    await user.click(screen.getByRole('button', { name: 'Add endpoint' }));
    await user.type(
      screen.getByRole('textbox', { name: 'DWN endpoint 3' }),
      'https://actor-a-backup.example/dwn',
    );
    await user.click(screen.getByRole('button', { name: 'Set up' }));

    expect(onSetup).toHaveBeenCalledWith('4321', [
      'https://enbox-dwn.fly.dev',
      'https://dev.aws.dwn.enbox.id',
      'https://actor-a-backup.example/dwn',
    ]);
  });

  it('requires at least one endpoint before setup', async () => {
    const user = userEvent.setup();
    render(<SetupScreen {...defaults} />);

    enterPin('4321');
    await screen.findByText('Confirm PIN');
    enterPin('4321');
    await screen.findByText('DWN Endpoints');

    await user.click(screen.getByRole('button', { name: 'Remove DWN endpoint 2' }));
    await user.click(screen.getByRole('button', { name: 'Remove DWN endpoint 1' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one DWN endpoint');
    expect(screen.getByRole('button', { name: 'Set up' })).toBeDisabled();
  });

  it('defaults to passkey setup when passkeys are supported', async () => {
    passkeyMocks.canCheckPasskeySupport.mockReturnValue(true);
    passkeyMocks.isPasskeySupported.mockResolvedValue(true);

    render(<SetupScreen {...defaults} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /use passkey/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /use pin instead/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('creates and stores a passkey credential before passkey setup', async () => {
    const onSetup = vi.fn().mockResolvedValue(undefined);
    const credential = {
      version: 1,
      credentialId: 'credential-id',
      salt: 'salt',
      iv: 'iv',
      wrappedVaultPassword: 'wrapped',
      createdAt: '2026-06-20T00:00:00.000Z',
    };
    passkeyMocks.canCheckPasskeySupport.mockReturnValue(true);
    passkeyMocks.isPasskeySupported.mockResolvedValue(true);
    passkeyMocks.preparePasskeyVaultPassword.mockResolvedValue({
      password: 'vault-password',
      credential,
    });

    const user = userEvent.setup();
    render(<SetupScreen {...defaults} onSetup={onSetup} />);

    await user.click(await screen.findByRole('button', { name: /use passkey/i }));
    await user.click(screen.getByRole('button', { name: /create passkey and set up/i }));

    await waitFor(() => {
      expect(onSetup).toHaveBeenCalledWith('vault-password', expect.any(Array));
    });
    expect(passkeyMocks.storePasskeyCredential).toHaveBeenCalledWith(credential);
    expect(passkeyMocks.markPinAuthMethod).not.toHaveBeenCalled();
  });

  it('falls back to PIN creation when the passkey provider cannot secure the vault', async () => {
    const error = new Error('This browser or passkey provider cannot secure the wallet vault. Create a PIN instead.');
    passkeyMocks.canCheckPasskeySupport.mockReturnValue(true);
    passkeyMocks.isPasskeySupported.mockResolvedValue(true);
    passkeyMocks.preparePasskeyVaultPassword.mockRejectedValue(error);
    passkeyMocks.isPasskeyVaultUnsupportedError.mockImplementation((value) => value === error);

    const user = userEvent.setup();
    render(<SetupScreen {...defaults} />);

    await user.click(await screen.findByRole('button', { name: /use passkey/i }));
    await user.click(screen.getByRole('button', { name: /create passkey and set up/i }));

    await waitFor(() => {
      expect(screen.getByText(/create a pin to secure your wallet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot secure the wallet vault/i);
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
  });

  it('back button in step 2 returns to step 1', async () => {
    const user = userEvent.setup();
    render(<SetupScreen {...defaults} />);

    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Welcome to Enbox')).toBeInTheDocument();
  });

  it('back button in step 3 returns to step 2', async () => {
    const user = userEvent.setup();
    render(<SetupScreen {...defaults} />);

    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByText('DWN Endpoints')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
  });

  it('shows loader when isLoading is true at endpoints step', async () => {
    render(<SetupScreen {...defaults} isLoading />);

    // Navigate to endpoints step
    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByText('Setting up your wallet...')).toBeInTheDocument();
    });
  });

  it('displays error in endpoints step', async () => {
    render(<SetupScreen {...defaults} error="Connection failed" />);

    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('1234');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Connection failed');
    });
  });

  it('renders the Enbox logo', () => {
    render(<SetupScreen {...defaults} />);
    expect(screen.getByText('Identity Wallet')).toBeInTheDocument();
  });
});
