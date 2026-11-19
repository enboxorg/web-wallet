import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ConsentDecisionBar } from '../ConsentLayout';

let report: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;

class FakeIntersectionObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    report = callback;
  }
  observe() {}
  disconnect() {}
}

describe('ConsentDecisionBar', () => {
  beforeEach(() => {
    report = undefined;
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderBar() {
    render(<ConsentDecisionBar onDeny={vi.fn()} primary={<button type="button">Approve</button>} />);
  }

  it('sits in the page flow rather than pinned to the screen', () => {
    renderBar();
    expect(screen.getByTestId('connect-action-area')).not.toHaveClass('sticky');
  });

  it('says there is more to review until the decision scrolls into view', () => {
    renderBar();
    expect(screen.queryByRole('button', { name: /scroll to review/i })).not.toBeInTheDocument();

    act(() => report?.([{ isIntersecting: false }]));
    expect(screen.getByRole('button', { name: /scroll to review/i })).toBeInTheDocument();

    act(() => report?.([{ isIntersecting: true }]));
    expect(screen.queryByRole('button', { name: /scroll to review/i })).not.toBeInTheDocument();
  });

  it('moves the page along by a screen, not straight to the buttons', () => {
    const scrollBy = vi.fn();
    vi.stubGlobal('scrollBy', scrollBy);
    renderBar();
    act(() => report?.([{ isIntersecting: false }]));

    fireEvent.click(screen.getByRole('button', { name: /scroll to review/i }));
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: window.innerHeight * 0.75 }));
  });
});
