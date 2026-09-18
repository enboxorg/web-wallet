import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { runEnboxPromise } from '../runtime';
import {
  NetworkPolicy,
  makeNetworkPolicy,
  withNetworkDeadline,
  withNetworkPolicy,
} from '../network-policy';

describe('NetworkPolicy', () => {
  it('retries operations through an injectable policy', async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('ok');

    const effect = withNetworkPolicy(
      'test.retry',
      Effect.tryPromise({ try: () => run(), catch: (error) => error as Error }),
      () => new Error('timed out'),
    ).pipe(
      Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
        retryTimes: 1,
        timeout: '1 second',
      }))),
    );

    await expect(runEnboxPromise(effect)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('maps timeouts through the caller typed error boundary', async () => {
    let operationSignal: AbortSignal | undefined;
    const effect = withNetworkPolicy(
      'test.timeout',
      Effect.tryPromise({
        try: (signal) => {
          operationSignal = signal;
          return new Promise<string>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('The operation was aborted', 'AbortError')),
              { once: true },
            );
          });
        },
        catch: (error) => error as Error,
      }),
      () => new Error('custom timeout'),
    ).pipe(
      Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
        retryTimes: 0,
        timeout: '1 millis',
      }))),
    );

    await expect(runEnboxPromise(effect)).rejects.toMatchObject({ message: 'custom timeout' });
    expect(operationSignal?.aborted).toBe(true);
  });

  it('does not retry non-transient permission failures', async () => {
    const run = vi.fn().mockRejectedValue(new Error(
      'CachedPermissions: No permissions found for ProtocolsConfigure',
    ));

    const effect = withNetworkPolicy(
      'test.permissions',
      Effect.tryPromise({ try: () => run(), catch: (error) => error as Error }),
      () => new Error('timed out'),
    ).pipe(
      Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
        retryTimes: 3,
        timeout: '1 second',
      }))),
    );

    await expect(runEnboxPromise(effect)).rejects.toMatchObject({
      message: 'CachedPermissions: No permissions found for ProtocolsConfigure',
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it('applies the shared deadline without retrying a single-use operation', async () => {
    const run = vi.fn().mockRejectedValue(new Error('temporary network failure'));

    const effect = withNetworkDeadline(
      'test.single-use',
      Effect.tryPromise({ try: () => run(), catch: (error) => error as Error }),
      () => new Error('timed out'),
    ).pipe(
      Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
        retryTimes: 3,
        timeout: '1 second',
      }))),
    );

    await expect(runEnboxPromise(effect)).rejects.toThrow('temporary network failure');
    expect(run).toHaveBeenCalledOnce();
  });
});
