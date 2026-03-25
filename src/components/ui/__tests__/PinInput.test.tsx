import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PinInput } from '../PinInput';

describe('PinInput', () => {
  it('renders the correct number of digit inputs', () => {
    render(<PinInput onComplete={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(4);
  });

  it('renders custom length', () => {
    render(<PinInput length={6} onComplete={vi.fn()} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
  });

  it('calls onComplete when all digits are filled', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<PinInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole('textbox');

    await user.click(inputs[0]);
    await user.keyboard('1');
    await user.keyboard('2');
    await user.keyboard('3');
    await user.keyboard('4');

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('1234');
    });
  });

  it('only accepts digits', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<PinInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole('textbox');

    await user.click(inputs[0]);
    await user.keyboard('a');

    // First input should remain empty
    expect(inputs[0]).toHaveValue('');
  });

  it('handles backspace to go to previous input', async () => {
    const user = userEvent.setup();
    render(<PinInput onComplete={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox');

    await user.click(inputs[0]);
    await user.keyboard('1');
    await user.keyboard('2');

    // Now on input[2], backspace should clear input[1] and focus it
    await user.keyboard('{Backspace}');
    expect(inputs[1]).toHaveValue('');
  });

  it('supports paste of full PIN', async () => {
    const onComplete = vi.fn();
    render(<PinInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole('textbox');

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '5678' },
    });

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith('5678');
    });
  });

  it('ignores non-digit characters in paste', () => {
    const onComplete = vi.fn();
    render(<PinInput onComplete={onComplete} />);
    const inputs = screen.getAllByRole('textbox');

    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => '12ab' },
    });

    // Only "12" should be captured, not complete
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('disables all inputs when disabled', () => {
    render(<PinInput onComplete={vi.fn()} disabled />);
    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  it('has correct aria-labels', () => {
    render(<PinInput onComplete={vi.fn()} />);
    expect(screen.getByLabelText('PIN digit 1')).toBeInTheDocument();
    expect(screen.getByLabelText('PIN digit 4')).toBeInTheDocument();
  });
});
