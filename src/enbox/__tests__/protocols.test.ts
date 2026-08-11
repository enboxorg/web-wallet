import type { EnboxAgent } from '../types';

import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentAgentLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';
import { IDENTITY_SYNC_PROTOCOLS, installProtocolsEffect } from '../protocols';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  ensureReady: vi.fn(async () => {}),
}));

vi.mock('@enbox/browser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/browser')>(),
  Enbox: vi.fn(function Enbox() {
    return {
      close     : mocks.close,
      protocols : { ensureReady: mocks.ensureReady },
    };
  }),
}));

describe('wallet protocol manifest', () => {
  afterEach(() => vi.clearAllMocks());

  it('installs the owner sync protocols locally through Enbox readiness', async () => {
    await runEnboxPromise(
      installProtocolsEffect('did:dht:alice').pipe(
        Effect.provide(currentAgentLayer({} as EnboxAgent)),
      ),
    );

    const options = mocks.ensureReady.mock.calls[0][0];
    expect(options.publish).toBe(false);
    expect(options.application.protocols.map(({ protocol }) => protocol.definition.protocol))
      .toEqual(IDENTITY_SYNC_PROTOCOLS);
    expect(options.application.protocols.at(-1)?.permissions).toEqual(['read']);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
