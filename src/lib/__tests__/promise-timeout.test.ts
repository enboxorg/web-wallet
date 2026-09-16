import { afterEach, describe, expect, it, vi } from 'vitest';

import { withPromiseTimeout } from '../promise-timeout';

describe('withPromiseTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an operation that settles before its deadline', async () => {
    await expect(withPromiseTimeout(
      async () => 'ready',
      1_000,
      () => new Error('timed out'),
    )).resolves.toBe('ready');
  });

  it('rejects at the deadline when an operation never settles', async () => {
    vi.useFakeTimers();
    const result = withPromiseTimeout(
      () => new Promise<string>(() => {}),
      1_000,
      () => new Error('Wallet operation timed out.'),
    );
    const rejection = expect(result).rejects.toThrow('Wallet operation timed out.');

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
  });
});
