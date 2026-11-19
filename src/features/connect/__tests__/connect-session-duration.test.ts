import { describe, expect, it } from 'vitest';

import {
  CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
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

  it('defaults to 7 days when the request sets no limit or a longer one', () => {
    const week = 7 * 24 * 60 * 60;
    expect(CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS).toBe(week);
    expect(resolveConnectSessionApprovalDurationSeconds()).toBe(week);
    expect(resolveConnectSessionApprovalDurationSeconds(90 * 24 * 60 * 60)).toBe(week);
    expect(getConnectSessionDurationOptions()).toEqual([
      { value: 60 * 60, label: '1 hour' },
      { value: week, label: '7 days' },
      { value: 30 * 24 * 60 * 60, label: '30 days' },
    ]);
  });

  it('never defaults above what the app asked for, and drops choices above it', () => {
    const day = 24 * 60 * 60;
    expect(resolveConnectSessionApprovalDurationSeconds(day)).toBe(day);
    expect(getConnectSessionDurationOptions(day)).toEqual([
      { value: 60 * 60, label: '1 hour' },
      { value: day, label: '1 day' },
    ]);
  });

  it('offers exactly the wallet choices when the request allows 7 days', () => {
    const week = 7 * 24 * 60 * 60;
    expect(resolveConnectSessionApprovalDurationSeconds(week)).toBe(week);
    expect(getConnectSessionDurationOptions(week)).toEqual([
      { value: 60 * 60, label: '1 hour' },
      { value: week, label: '7 days' },
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
