import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BrandHalo, EnboxMark, EnboxMarkTile, Wordmark } from '../Brand';

describe('Brand', () => {
  it('draws the mark as a decorative image', () => {
    render(<EnboxMark className="size-8" />);
    const mark = screen.getByTestId('enbox-mark');
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(mark).toHaveClass('size-8');
  });

  it('sizes the tile, puts the mark in it, and hides it from assistive tech', () => {
    render(<EnboxMarkTile size="lg" className="extra" />);
    const tile = screen.getByTestId('enbox-mark-tile');
    expect(tile).toHaveAttribute('aria-hidden', 'true');
    expect(tile).toHaveClass('size-16', 'extra');
    expect(within(tile).getByTestId('enbox-mark')).toBeInTheDocument();
  });

  it('spells the wordmark with a bold accent b', () => {
    render(<Wordmark className="text-xl" />);
    expect(screen.getByTestId('enbox-wordmark')).toHaveTextContent('enbox');
    expect(screen.getByTestId('enbox-wordmark')).toHaveClass('text-xl');
    expect(screen.getByText('b')).toHaveClass('text-accent', 'font-bold');
  });

  it('keeps the halo out of the way of pointers and assistive tech', () => {
    render(<BrandHalo />);
    const halo = screen.getByTestId('brand-halo');
    expect(halo).toHaveAttribute('aria-hidden', 'true');
    expect(halo).toHaveClass('pointer-events-none');
    expect(screen.getAllByTestId('brand-halo-ring')).toHaveLength(5);
  });
});
