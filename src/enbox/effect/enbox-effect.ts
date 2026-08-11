import { Enbox } from '@enbox/browser';
import { Effect } from 'effect';

import { sdkError } from './errors';
import { CurrentAgent } from './services';

/** Run one operation with a DID-bound Enbox facade and always close it. */
export function withEnboxEffect<A, E, R>(
  did: string,
  use: (enbox: Enbox) => Effect.Effect<A, E, R>,
) {
  return Effect.flatMap(CurrentAgent, (agent) => Effect.acquireUseRelease(
    Effect.try({
      try: () => new Enbox({ agent, connectedDid: did }),
      catch: sdkError('enbox.create'),
    }),
    use,
    (enbox) => Effect.sync(() => enbox.close()),
  ));
}
