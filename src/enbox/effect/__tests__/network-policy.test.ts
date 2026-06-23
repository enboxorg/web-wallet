import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import { runEnboxPromise } from '../runtime';
import { NetworkPolicy, makeNetworkPolicy, withNetworkPolicy } from '../network-policy';

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
    const effect = withNetworkPolicy(
      'test.timeout',
      Effect.promise(() => new Promise((resolve) => setTimeout(() => resolve('late'), 50))),
      () => new Error('custom timeout'),
    ).pipe(
      Effect.provideService(NetworkPolicy, NetworkPolicy.of(makeNetworkPolicy({
        retryTimes: 0,
        timeout: '1 millis',
      }))),
    );

    await expect(runEnboxPromise(effect)).rejects.toMatchObject({ message: 'custom timeout' });
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
});
