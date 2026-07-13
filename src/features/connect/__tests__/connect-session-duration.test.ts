import { describe, expect, it } from 'vitest';

import { formatRelativeExpiry } from '../connect-session-duration';

describe('formatRelativeExpiry', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  it('formats future and elapsed expiries relative to an injected clock', () => {
    expect(formatRelativeExpiry('2026-07-13T12:30:00.000Z', now)).toBe('in 30 minutes');
    expect(formatRelativeExpiry('2026-07-13T10:00:00.000Z', now)).toBe('2 hours ago');
  });

  it('handles malformed timestamps without throwing', () => {
    expect(formatRelativeExpiry('not-a-date', now)).toBe('at an unknown time');
  });
});
