import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('shows default DWN endpoints as chips', async () => {
    render(<SetupScreen {...defaults} />);
    enterPin('1234');

    await waitFor(() => {
      expect(screen.getByText('Confirm PIN')).toBeInTheDocument();
    });

    enterPin('1234');

    await waitFor(() => {
      // Endpoints are displayed without protocol prefix
      expect(screen.getByText('enbox-dwn.fly.dev')).toBeInTheDocument();
      expect(screen.getByText('dev.aws.dwn.enbox.id')).toBeInTheDocument();
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
