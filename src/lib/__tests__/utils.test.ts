import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  cn,
  truncateDid,
  copyToClipboard,
  formatRelativeTime,
} from '../utils';

// ---------------------------------------------------------------------------
// cn()
// ---------------------------------------------------------------------------
describe('cn', () => {
  it('returns an empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns a single class name as-is', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple string class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', false, null, undefined, 0, '', 'bar')).toBe('foo bar');
  });

  it('handles conditional object syntax', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });

  it('handles mixed inputs (strings, objects, arrays)', () => {
    expect(cn('base', ['arr1', 'arr2'], { cond: true, skip: false })).toBe(
      'base arr1 arr2 cond',
    );
  });

  it('handles nested arrays', () => {
    expect(cn(['a', ['b', 'c']])).toBe('a b c');
  });
});

// ---------------------------------------------------------------------------
// truncateDid()
// ---------------------------------------------------------------------------
describe('truncateDid', () => {
  const longDid =
    'did:dht:abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz';

  it('truncates a long DID with default chars (8)', () => {
    const result = truncateDid(longDid);
    expect(result).toMatch(/^did:dht:[a-z0-9]{8}\.\.\.[a-z0-9]{8}$/);
    expect(result).toBe('did:dht:abcdefgh...stuvwxyz');
  });

  it('truncates with a custom char count', () => {
    const result = truncateDid(longDid, 4);
    expect(result).toBe('did:dht:abcd...wxyz');
  });

  it('returns short DIDs unchanged', () => {
    const shortDid = 'did:key:abc123';
    expect(truncateDid(shortDid)).toBe(shortDid);
  });

  it('returns the original DID when identifier is short enough', () => {
    // identifier length <= chars * 2 → return as-is
    const did = 'did:dht:abcdefghijklmnop'; // identifier = 16 chars = 8*2
    expect(truncateDid(did, 8)).toBe(did);
  });

  it('returns an empty string as-is', () => {
    expect(truncateDid('')).toBe('');
  });

  it('returns a DID with fewer than 3 colon-separated parts as-is', () => {
    expect(truncateDid('did:method')).toBe('did:method');
  });

  it('handles DIDs with extra colons in the identifier', () => {
    const did =
      'did:web:example.com:path:to:resource:extra:long:segment:more:data:here';
    const result = truncateDid(did, 6);
    // parts.slice(2).join(':') => "example.com:path:to:resource:extra:long:segment:more:data:here"
    const identifier = 'example.com:path:to:resource:extra:long:segment:more:data:here';
    const expectedStart = identifier.slice(0, 6);
    const expectedEnd = identifier.slice(-6);
    expect(result).toBe(`did:web:${expectedStart}...${expectedEnd}`);
  });

  it('returns the DID when total length is within threshold', () => {
    // did.length <= chars * 2 + 10  →  return did
    // chars=8, threshold = 26
    const did = 'did:dht:abcdefghijklmn'; // length 22, under 26
    expect(truncateDid(did)).toBe(did);
  });

  it('handles null/undefined gracefully (falsy guard)', () => {
    // The function checks `!did` first
    expect(truncateDid(null as unknown as string)).toBe(null);
    expect(truncateDid(undefined as unknown as string)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// copyToClipboard()
// ---------------------------------------------------------------------------
describe('copyToClipboard', () => {
  const writeTextMock = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeTextMock.mockResolvedValue(undefined);
    // navigator.clipboard is read-only in happy-dom, so use defineProperty
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when clipboard write succeeds', async () => {
    const result = await copyToClipboard('hello');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('hello');
  });

  it('returns false when clipboard write throws', async () => {
    writeTextMock.mockRejectedValueOnce(new Error('denied'));
    const result = await copyToClipboard('secret');
    expect(result).toBe(false);
  });

  it('passes the exact text to the clipboard API', async () => {
    const text = 'did:dht:abc123xyz789';
    await copyToClipboard(text);
    expect(writeTextMock).toHaveBeenCalledWith(text);
  });

  it('handles empty string', async () => {
    const result = await copyToClipboard('');
    expect(result).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('');
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime()
// ---------------------------------------------------------------------------
describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Fix "now" to a known point: 2025-06-15T12:00:00.000Z
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for a timestamp less than 60 seconds ago', () => {
    const date = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(date)).toBe('just now');
  });

  it('returns "just now" for the current timestamp (0 seconds ago)', () => {
    expect(formatRelativeTime(new Date())).toBe('just now');
  });

  it('returns minutes ago for 1–59 minutes', () => {
    expect(formatRelativeTime(new Date(Date.now() - 60 * 1000))).toBe('1m ago');
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60 * 1000))).toBe(
      '5m ago',
    );
    expect(formatRelativeTime(new Date(Date.now() - 59 * 60 * 1000))).toBe(
      '59m ago',
    );
  });

  it('returns hours ago for 1–23 hours', () => {
    expect(formatRelativeTime(new Date(Date.now() - 3600 * 1000))).toBe(
      '1h ago',
    );
    expect(formatRelativeTime(new Date(Date.now() - 12 * 3600 * 1000))).toBe(
      '12h ago',
    );
    expect(formatRelativeTime(new Date(Date.now() - 23 * 3600 * 1000))).toBe(
      '23h ago',
    );
  });

  it('returns days ago for 1–6 days', () => {
    expect(formatRelativeTime(new Date(Date.now() - 86400 * 1000))).toBe(
      '1d ago',
    );
    expect(formatRelativeTime(new Date(Date.now() - 3 * 86400 * 1000))).toBe(
      '3d ago',
    );
    expect(formatRelativeTime(new Date(Date.now() - 6 * 86400 * 1000))).toBe(
      '6d ago',
    );
  });

  it('returns a locale date string for 7+ days ago', () => {
    const oldDate = new Date(Date.now() - 7 * 86400 * 1000);
    const result = formatRelativeTime(oldDate);
    // Should be a formatted date, not a relative string
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
    // Verify it matches the toLocaleDateString output
    expect(result).toBe(oldDate.toLocaleDateString());
  });

  it('returns a locale date string for very old dates', () => {
    const ancient = new Date('2020-01-01T00:00:00.000Z');
    const result = formatRelativeTime(ancient);
    expect(result).toBe(ancient.toLocaleDateString());
  });

  it('accepts a string date input', () => {
    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    expect(formatRelativeTime(thirtySecondsAgo)).toBe('just now');
  });

  it('accepts a numeric timestamp input', () => {
    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    expect(formatRelativeTime(twoHoursAgo)).toBe('2h ago');
  });

  it('handles boundary: exactly 60 seconds ago is "1m ago"', () => {
    expect(formatRelativeTime(new Date(Date.now() - 60 * 1000))).toBe(
      '1m ago',
    );
  });

  it('handles boundary: exactly 3600 seconds ago is "1h ago"', () => {
    expect(formatRelativeTime(new Date(Date.now() - 3600 * 1000))).toBe(
      '1h ago',
    );
  });

  it('handles boundary: exactly 86400 seconds ago is "1d ago"', () => {
    expect(formatRelativeTime(new Date(Date.now() - 86400 * 1000))).toBe(
      '1d ago',
    );
  });

  it('handles boundary: exactly 604800 seconds (7 days) returns locale date', () => {
    const sevenDays = new Date(Date.now() - 604800 * 1000);
    expect(formatRelativeTime(sevenDays)).toBe(sevenDays.toLocaleDateString());
  });

  it('handles future dates (negative seconds) as "just now"', () => {
    // seconds will be negative (< 60), so "just now"
    const future = new Date(Date.now() + 60 * 1000);
    expect(formatRelativeTime(future)).toBe('just now');
  });
});

// ---------------------------------------------------------------------------

