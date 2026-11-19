import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';

import { useScrollMemory } from '../useScrollMemory';

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  useScrollMemory(ref);
  const navigate = useNavigate();

  return (
    <div ref={ref} data-testid="scroller">
      <button type="button" onClick={() => navigate('/details')}>Open details</button>
      <button type="button" onClick={() => navigate('/list?filter=work')}>Filter</button>
      <button type="button" onClick={() => navigate(-1)}>Back</button>
    </div>
  );
}

function setupScroller() {
  render(
    <MemoryRouter initialEntries={['/list']}>
      <Harness />
    </MemoryRouter>,
  );
  return screen.getByTestId('scroller');
}

function scrollTo(element: HTMLElement, top: number) {
  element.scrollTop = top;
  fireEvent.scroll(element);
}

describe('useScrollMemory', () => {
  it('starts a newly opened page at the top', () => {
    const scroller = setupScroller();
    scrollTo(scroller, 480);

    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));

    expect(scroller.scrollTop).toBe(0);
  });

  it('returns to where a page was left when going back', () => {
    const scroller = setupScroller();
    scrollTo(scroller, 480);
    fireEvent.click(screen.getByRole('button', { name: 'Open details' }));
    scrollTo(scroller, 120);

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(scroller.scrollTop).toBe(480);
  });

  it('leaves the position alone when only the query changes', () => {
    const scroller = setupScroller();
    scrollTo(scroller, 480);

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));

    expect(scroller.scrollTop).toBe(480);
  });
});
