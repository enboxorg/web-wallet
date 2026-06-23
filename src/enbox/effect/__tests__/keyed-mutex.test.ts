import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { makeKeyedMutex } from '../keyed-mutex';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('KeyedMutex', () => {
  it('serializes effects that use the same key and cleans up the lock entry', async () => {
    const mutex = makeKeyedMutex();
    const events: string[] = [];

    await Effect.runPromise(
      Effect.all([
        mutex.withLock('identity')(
          Effect.promise(async () => {
            events.push('first:start');
            await delay(10);
            events.push('first:end');
          }),
        ),
        mutex.withLock('identity')(
          Effect.sync(() => {
            events.push('second:start');
            events.push('second:end');
          }),
        ),
      ], { concurrency: 'unbounded' }),
    );

    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
    await expect(Effect.runPromise(mutex.size)).resolves.toBe(0);
  });

  it('allows effects with different keys to overlap', async () => {
    const mutex = makeKeyedMutex();
    const events: string[] = [];

    await Effect.runPromise(
      Effect.all([
        mutex.withLock('alice')(
          Effect.promise(async () => {
            events.push('alice:start');
            await delay(10);
            events.push('alice:end');
          }),
        ),
        mutex.withLock('bob')(
          Effect.sync(() => {
            events.push('bob:start');
          }),
        ),
      ], { concurrency: 'unbounded' }),
    );

    expect(events).toEqual([
      'alice:start',
      'bob:start',
      'alice:end',
    ]);
  });
});
