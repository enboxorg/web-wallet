import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';

import { runEnboxPromise, runEnboxSync } from '@/enbox/effect/runtime';
import {
  checkEndpointHealthEffect,
  copyToClipboardEffect,
  localStorageGetEffect,
  localStorageRemoveEffect,
  localStorageSetEffect,
  randomUuidEffect,
  registerServiceWorkerEffect,
  sessionStorageGetEffect,
  sessionStorageRemoveEffect,
  sessionStorageSetEffect,
  shareEffect,
} from '../browser-effects';

describe('browser-effects', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads, writes, and removes localStorage values through Effect programs', () => {
    runEnboxSync(localStorageSetEffect('browser-effect:key', 'value'));
    expect(runEnboxSync(localStorageGetEffect('browser-effect:key'))).toBe('value');

    runEnboxSync(localStorageRemoveEffect('browser-effect:key'));
    expect(runEnboxSync(localStorageGetEffect('browser-effect:key'))).toBeNull();
  });

  it('reads, writes, and removes sessionStorage values through Effect programs', () => {
    runEnboxSync(sessionStorageSetEffect('browser-effect:key', 'value'));
    expect(runEnboxSync(sessionStorageGetEffect('browser-effect:key'))).toBe('value');

    runEnboxSync(sessionStorageRemoveEffect('browser-effect:key'));
    expect(runEnboxSync(sessionStorageGetEffect('browser-effect:key'))).toBeNull();
  });

  it('returns false when clipboard writes fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });

    await expect(runEnboxPromise(copyToClipboardEffect('secret'))).resolves.toBe(false);
  });

  it('generates UUIDs through an Effect program', () => {
    expect(runEnboxSync(randomUuidEffect())).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/,
    );
  });

  it('shares through navigator.share when available', async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });

    await expect(
      runEnboxPromise(shareEffect({ title: 'Profile', text: 'did:example:123' })),
    ).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ title: 'Profile', text: 'did:example:123' });
  });

  it('checks endpoint health through fetch', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));

    await expect(
      runEnboxPromise(checkEndpointHealthEffect('https://dwn.example')),
    ).resolves.toBe('ok');
    expect(fetch).toHaveBeenCalledWith(
      'https://dwn.example/info',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('treats failed endpoint health fetches as errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(
      runEnboxPromise(checkEndpointHealthEffect('https://dwn.example')),
    ).resolves.toBe('error');
  });

  it('registers service workers through an Effect program', async () => {
    const register = vi.fn(async () => ({} as ServiceWorkerRegistration));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register },
    });

    await expect(
      runEnboxPromise(registerServiceWorkerEffect('/sw.js', { type: 'module' })),
    ).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { type: 'module' });
  });
});
