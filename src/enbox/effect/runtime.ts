import { Cause, Effect, Exit, ManagedRuntime, Option } from 'effect';

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

export function runEnboxSync<A, E>(
  effect: Effect.Effect<A, E, AppServices>,
): A {
  const exit = AppRuntime.runSyncExit(
    effect.pipe(Effect.mapError(enboxEffectErrorToError)),
  );
  return valueOrThrow(exit);
}
