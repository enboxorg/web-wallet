import { Effect } from 'effect';

import { enboxEffectErrorToError } from './errors';

export function runEnboxPromise<A, E>(
  effect: Effect.Effect<A, E, never>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(Effect.mapError(enboxEffectErrorToError)),
  );
}
