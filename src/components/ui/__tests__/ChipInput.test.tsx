import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipInput } from '../ChipInput';

describe('ChipInput', () => {
  it('renders existing chips', () => {
    render(<ChipInput values={['React', 'Vue']} onChange={() => {}} />);
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('Vue')).toBeInTheDocument();
  });

  it('removes a chip when X is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipInput values={['React', 'Vue']} onChange={onChange} />);
    await user.click(screen.getByLabelText('Remove React'));
    expect(onChange).toHaveBeenCalledWith(['Vue']);
  });

  it('adds a chip on Enter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipInput values={['React']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'Svelte{Enter}');
    expect(onChange).toHaveBeenCalledWith(['React', 'Svelte']);
  });

  it('adds a chip on comma', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipInput values={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'Solid,');
    expect(onChange).toHaveBeenCalledWith(['Solid']);
  });

  it('does not add an empty chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipInput values={[]} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await user.type(input, '{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not add a duplicate chip', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChipInput values={['React']} onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await user.type(input, 'React{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a label when provided', () => {
    render(<ChipInput values={[]} onChange={() => {}} label="Tags" />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
  });
});
