import { afterEach, describe, expect, it, vi } from 'vitest';

import { postCliCallback } from '../cli-callback';

describe('postCliCallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false for a non-loopback callback without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await postCliCallback('https://evil.example.com/cb', '{}')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false when no callback url is given', async () => {
    expect(await postCliCallback(undefined, '{}')).toBe(false);
  });

  it('POSTs to a loopback callback and reports success', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const ok = await postCliCallback('http://127.0.0.1:7421/callback', '{"a":1}');
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:7421/callback');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
  });

  it('returns false when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    expect(await postCliCallback('http://127.0.0.1:7421/callback', '{}')).toBe(false);
  });
});
