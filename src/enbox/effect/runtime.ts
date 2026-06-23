import { Cause, Effect, Exit, Fiber, ManagedRuntime, Option } from 'effect';

import { AppLayer, type AppServices } from './app-layer';
import { enboxEffectErrorToError } from './errors';

export const AppRuntime = ManagedRuntime.make(AppLayer);

function errorFromCause(cause: Cause.Cause<unknown>): Error {
  const failure = Cause.failureOption(cause);
  if (Option.isSome(failure)) {
    return enboxEffectErrorToError(failure.value);
  }

  const defect = Cause.dieOption(cause);
  if (Option.isSome(defect)) {
    return enboxEffectErrorToError(defect.value);
  }

  return new Error(Cause.pretty(cause));
}

function valueOrThrow<A>(exit: Exit.Exit<A, unknown>): A {
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw errorFromCause(exit.cause);
}

export function runEnboxPromise<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
): Promise<A> {
  return AppRuntime.runPromiseExit(
    effect.pipe(Effect.mapError(enboxEffectErrorToError)),
  ).then(valueOrThrow);
}

export function runEnboxFork<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
) {
  return AppRuntime.runFork(
    effect.pipe(Effect.mapError(enboxEffectErrorToError)),
  );
}

export function interruptEnboxFork(
  fiber: ReturnType<typeof runEnboxFork>,
): void {
  AppRuntime.runPromise(Fiber.interrupt(fiber)).catch((error: unknown) => {
    console.warn('Failed to interrupt Enbox Effect fiber:', error);
  });
}

export function runEnboxSync<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
): A {
  const exit = AppRuntime.runSyncExit(
    effect.pipe(Effect.mapError(enboxEffectErrorToError)),
  );
  return valueOrThrow(exit);
}
