import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SeedPhraseBackup } from '../SeedPhraseBackup';

const TEST_PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';
const TEST_WORDS = TEST_PHRASE.split(' ');

describe('SeedPhraseBackup', () => {
  it('renders all 12 words from a test phrase', () => {
    render(<SeedPhraseBackup phrase={TEST_PHRASE} onDone={vi.fn()} />);
    for (const word of TEST_WORDS) {
      expect(screen.getByText(word)).toBeInTheDocument();
    }
  });

  it('shows word numbers (1-12)', () => {
    render(<SeedPhraseBackup phrase={TEST_PHRASE} onDone={vi.fn()} />);
    for (let i = 1; i <= 12; i++) {
      expect(screen.getByText(`${i}.`)).toBeInTheDocument();
    }
  });

  it('has a copy button', () => {
    render(<SeedPhraseBackup phrase={TEST_PHRASE} onDone={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /copy/i }),
    ).toBeInTheDocument();
  });

  it('has an "I\'ve backed it up" button', () => {
    render(<SeedPhraseBackup phrase={TEST_PHRASE} onDone={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: /i've backed it up/i }),
    ).toBeInTheDocument();
  });

  it('clicking "I\'ve backed it up" calls onDone', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<SeedPhraseBackup phrase={TEST_PHRASE} onDone={onDone} />);

    await user.click(
      screen.getByRole('button', { name: /i've backed it up/i }),
    );
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('renders the recovery phrase in a list', () => {
    render(<SeedPhraseBackup phrase={TEST_PHRASE} onDone={vi.fn()} />);
    const list = screen.getByRole('list', {
      name: /recovery phrase words/i,
    });
    expect(list).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(12);
  });
});
