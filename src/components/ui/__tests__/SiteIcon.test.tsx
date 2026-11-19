import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { SiteIcon } from '../SiteIcon';

/** Which icon URLs "load", and at what width. Anything else fails. */
let outcomes: Record<string, number> = {};
const requested: string[] = [];

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  referrerPolicy = '';
  set src(value: string) {
    requested.push(value);
    queueMicrotask(() => {
      const width = outcomes[value];
      if (width === undefined) {
        this.onerror?.();
      } else {
        this.naturalWidth = width;
        this.onload?.();
      }
    });
  }
}

describe('SiteIcon', () => {
  beforeEach(() => {
    outcomes = {};
    requested.length = 0;
    vi.stubGlobal('Image', FakeImage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the best icon the site serves from its own origin', async () => {
    outcomes = {
      'https://app.example/favicon.svg' : 64,
      'https://app.example/favicon.ico' : 32,
    };
    render(<SiteIcon origin="https://app.example" label="Notes" seed="seed" />);

    await waitFor(() => expect(screen.getByTestId('site-icon')).toHaveAttribute('src', 'https://app.example/favicon.svg'));
    expect(screen.getByTestId('site-icon')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(requested).toContain('https://app.example/apple-touch-icon.png');
  });

  it('keeps the lettered tile when the site has no usable icon', async () => {
    outcomes = { 'https://app.example/favicon.ico': 1 };
    render(<SiteIcon origin="https://app.example" label="Notes" seed="seed" />);

    await waitFor(() => expect(requested).toHaveLength(3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('site-icon')).not.toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('never fetches without an origin, or from a non-web origin', () => {
    render(<SiteIcon label="Notes" seed="seed" />);
    render(<SiteIcon origin="javascript:alert(1)" label="Notes" seed="seed" />);
    expect(requested).toEqual([]);
  });
});
