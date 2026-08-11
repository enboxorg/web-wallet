import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  AUTO_LOCK_OPTIONS,
  DEFAULT_AUTO_LOCK_MS,
  AUTO_LOCK_STORAGE_KEY,
  getAutoLockTimeout,
  PIN_LENGTH,
  STORAGE_KEYS,
} from '../constants';

// ── AUTO_LOCK_OPTIONS shape ─────────────────────────────────────────

describe('AUTO_LOCK_OPTIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(AUTO_LOCK_OPTIONS)).toBe(true);
    expect(AUTO_LOCK_OPTIONS.length).toBeGreaterThan(0);
  });

  it('every option has a string label and a numeric value', () => {
    for (const option of AUTO_LOCK_OPTIONS) {
      expect(typeof option.label).toBe('string');
      expect(option.label.length).toBeGreaterThan(0);
      expect(typeof option.value).toBe('number');
      expect(option.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('contains a "Never" option with value 0', () => {
    const never = AUTO_LOCK_OPTIONS.find((o) => o.value === 0);
    expect(never).toBeDefined();
    expect(never!.label).toBe('Never');
  });

  it('contains the default timeout as one of the options', () => {
    const defaultOpt = AUTO_LOCK_OPTIONS.find(
      (o) => o.value === DEFAULT_AUTO_LOCK_MS,
    );
    expect(defaultOpt).toBeDefined();
  });

  it('has values in ascending order (except Never=0 at the end)', () => {
    const nonZero = AUTO_LOCK_OPTIONS.filter((o) => o.value > 0);
    for (let i = 1; i < nonZero.length; i++) {
      expect(nonZero[i].value).toBeGreaterThan(nonZero[i - 1].value);
    }
  });
});

// ── getAutoLockTimeout ──────────────────────────────────────────────

describe('getAutoLockTimeout', () => {
  beforeEach(() => {
    // Provide a clean, functional localStorage mock before each test
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    });
    store.clear();
  });

  it('returns DEFAULT_AUTO_LOCK_MS when localStorage is empty', () => {
    expect(getAutoLockTimeout()).toBe(DEFAULT_AUTO_LOCK_MS);
  });

  it('returns the stored value when a valid number is set', () => {
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '300000');
    expect(getAutoLockTimeout()).toBe(300_000);
  });

  it('returns 0 when "Never" (0) is stored', () => {
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '0');
    expect(getAutoLockTimeout()).toBe(0);
  });

  it('returns DEFAULT_AUTO_LOCK_MS for non-numeric stored values', () => {
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, 'not-a-number');
    expect(getAutoLockTimeout()).toBe(DEFAULT_AUTO_LOCK_MS);
  });

  it('returns DEFAULT_AUTO_LOCK_MS for negative stored values', () => {
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '-1000');
    expect(getAutoLockTimeout()).toBe(DEFAULT_AUTO_LOCK_MS);
  });

  it('returns DEFAULT_AUTO_LOCK_MS for an empty string', () => {
    // Empty string → parseInt returns NaN
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '');
    expect(getAutoLockTimeout()).toBe(DEFAULT_AUTO_LOCK_MS);
  });

  it('returns DEFAULT_AUTO_LOCK_MS when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(getAutoLockTimeout()).toBe(DEFAULT_AUTO_LOCK_MS);
  });

  it('parses integer values correctly (ignores decimals)', () => {
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, '600123');
    expect(getAutoLockTimeout()).toBe(600_123);
  });
});

// ── Scalar constants ────────────────────────────────────────────────

describe('PIN_LENGTH', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(PIN_LENGTH)).toBe(true);
    expect(PIN_LENGTH).toBeGreaterThan(0);
  });

  it('is a reasonable PIN length (between 3 and 8)', () => {
    expect(PIN_LENGTH).toBeGreaterThanOrEqual(3);
    expect(PIN_LENGTH).toBeLessThanOrEqual(8);
  });
});

describe('DEFAULT_AUTO_LOCK_MS', () => {
  it('is a positive number', () => {
    expect(DEFAULT_AUTO_LOCK_MS).toBeGreaterThan(0);
  });
});

describe('STORAGE_KEYS', () => {
  it('has expected keys', () => {
    expect(STORAGE_KEYS).toHaveProperty('WALLET_DWN_ENDPOINTS');
    expect(STORAGE_KEYS).toHaveProperty('THEME');
  });

  it('all values are non-empty strings', () => {
    for (const value of Object.values(STORAGE_KEYS)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
