import type { EnboxAgent } from '../types';

import { Effect } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentAgentLayer } from '../effect/services';
import { runEnboxPromise } from '../effect/runtime';
import { IDENTITY_SYNC_MODULES, installModulesEffect } from '../modules';

const mocks = vi.hoisted(() => ({
  close: vi.fn(),
  ensureReady: vi.fn(async () => {}),
}));

vi.mock('@enbox/browser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/browser')>(),
  Enbox: vi.fn(function Enbox() {
    return {
      close     : mocks.close,
      modules : { ensureReady: mocks.ensureReady },
    };
  }),
}));

describe('wallet module manifest', () => {
  afterEach(() => vi.clearAllMocks());

  it('installs the owner sync modules locally through Enbox readiness', async () => {
    await runEnboxPromise(
      installModulesEffect('did:dht:alice').pipe(
        Effect.provide(currentAgentLayer({} as EnboxAgent)),
      ),
    );

    const options = mocks.ensureReady.mock.calls[0][0];
    expect(options.publish).toBe(false);
    expect(options.application.modules.map(({ module }) => module.definition.module))
      .toEqual(IDENTITY_SYNC_MODULES);
    expect(options.application.modules.at(-1)?.permissions).toEqual(['read']);
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
