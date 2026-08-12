import { describe, expect, it } from 'vitest';

import {
  getConnectSessionDurationOptions,
  formatRelativeExpiry,
  resolveConnectSessionApprovalDurationSeconds,
} from '../connect-session-duration';

describe('connect session approval duration', () => {
  it('uses a shorter requested lifetime as the approval default and maximum', () => {
    expect(resolveConnectSessionApprovalDurationSeconds(9 * 60)).toBe(9 * 60);
    expect(getConnectSessionDurationOptions(9 * 60)).toEqual([{
      value : 9 * 60,
      label : '9 minutes',
    }]);
  });

  it('keeps the wallet default while excluding choices above the request', () => {
    expect(resolveConnectSessionApprovalDurationSeconds(24 * 60 * 60)).toBe(60 * 60);
    expect(getConnectSessionDurationOptions(24 * 60 * 60)).toEqual([
      { value: 60 * 60, label: '1 hour' },
    ]);
  });
});

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
