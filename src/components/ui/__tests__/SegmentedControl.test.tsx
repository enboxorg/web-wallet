import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { SegmentedControl } from '../SegmentedControl';

const OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
];

function Harness() {
  const [value, setValue] = useState(1);
  return <SegmentedControl label="Access duration" options={OPTIONS} value={value} onChange={setValue} />;
}

describe('SegmentedControl', () => {
  it('exposes a named radio group with one checked option', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Access duration' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps a single tab stop on the checked option', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves and selects with arrow, Home and End keys', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.tab();
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: '7 days' })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: '1 hour' })).toHaveAttribute('aria-checked', 'true');
  });

  it('selects on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('radio', { name: '30 days' }));
    expect(screen.getByRole('radio', { name: '30 days' })).toHaveAttribute('aria-checked', 'true');
  });
});
