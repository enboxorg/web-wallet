import { beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '../constants';
import {
  DEFAULT_DWN_ENDPOINTS,
  getConfiguredDwnEndpoints,
  normalizeDwnEndpoints,
  setConfiguredDwnEndpoints,
} from '../dwn-endpoints';

describe('DWN endpoint configuration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns a defensive copy of the build defaults when no cache exists', () => {
    const endpoints = getConfiguredDwnEndpoints();
    endpoints.push('https://mutated.example');

    expect(getConfiguredDwnEndpoints()).toEqual(DEFAULT_DWN_ENDPOINTS);
  });

  it('normalizes and persists a versioned endpoint cache', () => {
    expect(setConfiguredDwnEndpoints([' https://DWN.Example/path/ '])).toEqual([
      'https://dwn.example/path',
    ]);
    expect(getConfiguredDwnEndpoints()).toEqual(['https://dwn.example/path']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS)!)).toEqual({
      version: 1,
      endpoints: ['https://dwn.example/path'],
    });
  });

  it.each([
    'not-json',
    JSON.stringify({ version: 2, endpoints: ['https://dwn.example'] }),
    JSON.stringify({ version: 1, endpoints: [] }),
    JSON.stringify({ version: 1, endpoints: ['https://dwn.example', 'https://DWN.example/'] }),
    JSON.stringify({ version: 1, endpoints: ['http://remote.example'] }),
  ])('falls back when the cached value is malformed or unsafe', (serialized) => {
    localStorage.setItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS, serialized);
    expect(getConfiguredDwnEndpoints()).toEqual(DEFAULT_DWN_ENDPOINTS);
  });

  it('rejects unsafe and ambiguous endpoint lists at the operation boundary', () => {
    expect(() => normalizeDwnEndpoints([])).toThrow('at least one');
    expect(() => normalizeDwnEndpoints(['https://user@dwn.example'])).toThrow('credentials');
    expect(() => normalizeDwnEndpoints(['https://dwn.example', 'https://DWN.example/'])).toThrow('unique');
  });

  it('rejects query strings and fragments in routing base URLs', () => {
    expect(() => normalizeDwnEndpoints([
      'https://dwn.example/rpc?tenant=alice',
    ])).toThrow('query strings or fragments');
    expect(() => normalizeDwnEndpoints([
      'https://dwn.example/rpc#route',
    ])).toThrow('query strings or fragments');
  });

  it('accepts endpoint lists without an arbitrary count limit while rejecting remote HTTP', () => {
    const endpoints = [
      'https://legacy.example/dwn',
      ...Array.from({ length: 4 }, (_, index) => `https://dwn-${index}.example`),
    ];

    expect(normalizeDwnEndpoints(endpoints)).toEqual(endpoints);
    expect(() => normalizeDwnEndpoints(['http://legacy.example/dwn'])).toThrow('HTTPS');
  });

  it('keeps the normalized result in the caller when cache storage is unavailable', () => {
    const storage = globalThis.localStorage;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error('blocked'); }),
    });

    try {
      expect(setConfiguredDwnEndpoints(['https://custom.example/'])).toEqual([
        'https://custom.example',
      ]);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      vi.stubGlobal('localStorage', storage);
      warn.mockRestore();
    }
  });

  it('uses hosted defaults when the build override is invalid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv(
      'VITE_DWN_ENDPOINTS',
      'https://duplicate.example,https://DUPLICATE.example/',
    );
    vi.resetModules();

    try {
      const endpoints = await import('../dwn-endpoints');
      expect(endpoints.DEFAULT_DWN_ENDPOINTS).toEqual([
        'https://enbox-dwn.fly.dev',
        'https://dev.aws.dwn.enbox.id',
      ]);
      expect(endpoints.getConfiguredDwnEndpoints()).toEqual(endpoints.DEFAULT_DWN_ENDPOINTS);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });
});
