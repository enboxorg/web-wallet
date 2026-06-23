import { Context, Effect, Layer, TSemaphore } from 'effect';

export interface KeyedMutexService {
  readonly size: Effect.Effect<number>;
  readonly withLock: (
    key: string,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
}

export class WalletOperationMutex extends Context.Tag('enbox/WalletOperationMutex')<
  WalletOperationMutex,
  KeyedMutexService
>() {}

export function makeKeyedMutex(): KeyedMutexService {
  const locks = new Map<string, { readonly semaphore: TSemaphore.TSemaphore; users: number }>();

  const withLock: KeyedMutexService['withLock'] = (key) => (effect) =>
    Effect.suspend(() => {
      const current = locks.get(key);
      const entry = current ?? { semaphore: TSemaphore.unsafeMake(1), users: 0 };

      if (!current) {
        locks.set(key, entry);
      }

      entry.users += 1;

      return TSemaphore.withPermit(effect, entry.semaphore).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            entry.users -= 1;
            if (entry.users === 0) {
              locks.delete(key);
            }
          }),
        ),
      );
    });

  return {
    size: Effect.sync(() => locks.size),
    withLock,
  };
}

export const WalletOperationMutexLive = Layer.succeed(
  WalletOperationMutex,
  makeKeyedMutex(),
);

export function withWalletOperationLock<A, E, R>(
  key: string,
  effect: Effect.Effect<A, E, R>,
) {
  return Effect.flatMap(WalletOperationMutex, (mutex) =>
    mutex.withLock(key)(effect)
  );
}
