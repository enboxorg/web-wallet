import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

    const inputs = screen.getAllByRole('textbox');
    await userEvent.setup().click(inputs[0]);
    await userEvent.setup().keyboard('1234');

    expect(onUnlock).toHaveBeenCalledWith('1234');
  });

  it('calls onUnlock when PIN is pasted', () => {
    const onUnlock = vi.fn();
    render(<UnlockScreen {...defaults} onUnlock={onUnlock} />);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '9876' },
    });

    expect(onUnlock).toHaveBeenCalledWith('9876');
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
});
