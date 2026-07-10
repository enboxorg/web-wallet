import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnlockScreen } from '../UnlockScreen';

describe('UnlockScreen', () => {
  const defaults = {
    onUnlock: vi.fn(),
    error: null,
    isLoading: false,
  };

  it('renders the logo, heading, and subtitle', () => {
    render(<UnlockScreen {...defaults} />);

    expect(screen.getByText('Unlock Wallet')).toBeInTheDocument();
    expect(screen.getByText('Enter your PIN to continue')).toBeInTheDocument();
    expect(screen.getByText('Identity Wallet')).toBeInTheDocument();
  });

  it('renders PIN input with 4 digit fields', () => {
    render(<UnlockScreen {...defaults} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(4);
  });

  it('calls onUnlock when a full PIN is entered', async () => {
    const onUnlock = vi.fn();
    render(<UnlockScreen {...defaults} onUnlock={onUnlock} />);

    // Drive each box's onChange directly instead of simulated typing:
    // PinInput's auto-focus timers (100ms/300ms) can steal focus between a
    // click and its keystroke, dropping a digit into an occupied box where
    // it is rejected — which made keyboard-based variants of this test
    // intermittently fail under load.
    const inputs = screen.getAllByRole('textbox');
    ['1', '2', '3', '4'].forEach((digit, index) => {
      fireEvent.change(inputs[index], { target: { value: digit } });
    });

    await waitFor(() => {
      expect(onUnlock).toHaveBeenCalledWith('1234');
    });
  });

  it('calls onUnlock when PIN is pasted', async () => {
    const onUnlock = vi.fn();
    render(<UnlockScreen {...defaults} onUnlock={onUnlock} />);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '9876' },
    });

    await waitFor(() => {
      expect(onUnlock).toHaveBeenCalledWith('9876');
    });
  });

  it('displays error message when error prop is set', () => {
    render(<UnlockScreen {...defaults} error="Incorrect PIN" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect PIN');
  });

  it('shows loader when isLoading is true', () => {
    render(<UnlockScreen {...defaults} isLoading />);
    expect(screen.getByText('Unlocking...')).toBeInTheDocument();
    // PIN inputs should not be visible while loading
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('does not call onUnlock while loading', async () => {
    const onUnlock = vi.fn();
    // When loading, the PIN input is replaced by the loader,
    // so onUnlock can't be triggered via PIN entry.
    render(<UnlockScreen {...defaults} onUnlock={onUnlock} isLoading />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('has no error message when error is null', () => {
    render(<UnlockScreen {...defaults} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows passkey unlock when a passkey is configured and available', () => {
    render(
      <UnlockScreen
        {...defaults}
        passkeyConfigured
        passkeyAvailable
        onUnlockWithPasskey={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText('Use your passkey to continue')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unlock with passkey/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('calls onUnlockWithPasskey when the passkey button is clicked', async () => {
    const onUnlockWithPasskey = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <UnlockScreen
        {...defaults}
        passkeyConfigured
        passkeyAvailable
        onUnlockWithPasskey={onUnlockWithPasskey}
      />,
    );

    await user.click(screen.getByRole('button', { name: /unlock with passkey/i }));
    expect(onUnlockWithPasskey).toHaveBeenCalledOnce();
  });

  it('does not show PIN input when a passkey wallet is unavailable on this device', () => {
    render(
      <UnlockScreen
        {...defaults}
        passkeyConfigured
        passkeyAvailable={false}
        passkeySupportChecked
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/passkeys are unavailable/i);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });
});
