import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectVerificationSymbol } from '@enbox/connect';

import { VerificationEmojiGrid } from '../VerificationEmojiGrid';

const SAMPLE_GRID: readonly ConnectVerificationSymbol[] = [
  { id: 0, emoji: '🐶', label: 'Dog' },
  { id: 1, emoji: '🦊', label: 'Fox' },
  { id: 2, emoji: '🚀', label: 'Rocket' },
  { id: 3, emoji: '🎸', label: 'Guitar' },
  { id: 4, emoji: '🌵', label: 'Cactus' },
  { id: 5, emoji: '🍕', label: 'Pizza' },
  { id: 6, emoji: '🌙', label: 'Moon' },
  { id: 7, emoji: '🔔', label: 'Bell' },
  { id: 8, emoji: '🔑', label: 'Key' },
];

describe('VerificationEmojiGrid', () => {
  it('renders all 9 symbol tiles and requires 3 selections before confirming', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <VerificationEmojiGrid
        grid={SAMPLE_GRID}
        appName="Notes"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Match the 3 symbols' })).toBeInTheDocument();
    expect(screen.getByText(/Tap the 3 symbols shown in Notes/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Select 3 matching symbols');

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();

    // Select 3 tiles in arbitrary order.
    const guitar = screen.getByRole('button', { name: 'Guitar' });
    const fox = screen.getByRole('button', { name: 'Fox' });
    const rocket = screen.getByRole('button', { name: 'Rocket' });
    const dog = screen.getByRole('button', { name: 'Dog' });

    fireEvent.click(guitar);
    expect(guitar).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Select 2 more');
    expect(confirm).toBeDisabled();

    fireEvent.click(fox);
    expect(screen.getByRole('status')).toHaveTextContent('Select 1 more');
    expect(confirm).toBeDisabled();

    fireEvent.click(rocket);
    expect(screen.getByRole('status')).toHaveTextContent('3 of 3 selected');
    expect(confirm).toBeEnabled();
    // Unselected tiles are locked out once 3 are chosen.
    expect(dog).toBeDisabled();

    // Tapping a selected tile deselects it and re-enables the others.
    fireEvent.click(fox);
    expect(fox).toHaveAttribute('aria-pressed', 'false');
    expect(dog).toBeEnabled();
    expect(confirm).toBeDisabled();

    // Re-pick Fox and confirm.
    fireEvent.click(fox);
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledWith([3, 2, 1]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('uses sign-in confirmation copy and invokes onCancel when cancelled', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <VerificationEmojiGrid
        grid={SAMPLE_GRID}
        authenticationOnly
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm sign-in' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables all buttons when disabled is true', () => {
    render(
      <VerificationEmojiGrid
        grid={SAMPLE_GRID}
        disabled
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    for (const symbol of SAMPLE_GRID) {
      expect(screen.getByRole('button', { name: symbol.label })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
