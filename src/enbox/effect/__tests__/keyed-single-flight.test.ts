import { describe, expect, it, vi } from 'vitest';

import { makeKeyedSingleFlight } from '../keyed-single-flight';

describe('KeyedSingleFlight', () => {
  it('shares one in-flight operation with callers using the same scope and key', async () => {
    const singleFlight = makeKeyedSingleFlight();
    const scope = {};
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const operation = vi.fn(async () => gate);

    const first = singleFlight.run(scope, 'identity', operation);
    const second = singleFlight.run(scope, 'identity', operation);

    expect(operation).not.toHaveBeenCalled();
    release('ready');

    await expect(Promise.all([first, second])).resolves.toEqual(['ready', 'ready']);
    expect(operation).toHaveBeenCalledTimes(1);

    await expect(singleFlight.run(scope, 'identity', operation)).resolves.toBe('ready');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not coalesce different keys or different agent scopes', async () => {
    const singleFlight = makeKeyedSingleFlight();
    const firstScope = {};
    const secondScope = {};
    const operation = vi.fn(async () => 'ready');

    await Promise.all([
      singleFlight.run(firstScope, 'alice', operation),
      singleFlight.run(firstScope, 'bob', operation),
      singleFlight.run(secondScope, 'alice', operation),
    ]);

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('evicts a failed operation so a later retry starts fresh work', async () => {
    const singleFlight = makeKeyedSingleFlight();
    const scope = {};
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('ready');

    const first = singleFlight.run(scope, 'identity', operation);
    const joined = singleFlight.run(scope, 'identity', operation);
    await expect(Promise.all([first, joined])).rejects.toThrow('offline');

    await expect(singleFlight.run(scope, 'identity', operation)).resolves.toBe('ready');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
