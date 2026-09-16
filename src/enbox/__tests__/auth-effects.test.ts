import { describe, expect, it, vi } from 'vitest';

import {
  connectVaultEffect,
  resolveProviderAuthEffect,
  restoreFromPhraseEffect,
} from '../auth-effects';
import { runEnboxPromise } from '../effect/runtime';

describe('wallet auth effects', () => {
  it('binds provider authorization fetches to the Effect lifecycle', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'authorization-code',
      state: 'expected-state',
    })));

    await expect(runEnboxPromise(resolveProviderAuthEffect({
      authorizeUrl: 'https://provider.example/authorize',
      dwnEndpoint: 'https://dwn.example',
      state: 'expected-state',
    }))).resolves.toEqual({
      code: 'authorization-code',
      state: 'expected-state',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://provider.example/authorize',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    fetchMock.mockRestore();
  });

  it('normalizes setup endpoints at the SDK operation boundary', async () => {
    const auth = {
      connectVault: vi.fn(async () => ({ agent: {} })),
    };

    await runEnboxPromise(connectVaultEffect(
      auth as any,
      'password',
      [' https://DWN.Example/path/ '],
    ));

    expect(auth.connectVault).toHaveBeenCalledWith(expect.objectContaining({
      dwnEndpoints: ['https://dwn.example/path'],
    }));
  });

  it('omits an endpoint override during normal phrase recovery', async () => {
    const auth = {
      restoreFromPhrase: vi.fn(async () => ({ agent: {} })),
    };

    await runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
    ));

    expect(auth.restoreFromPhrase).toHaveBeenCalledOnce();
    const [options] = auth.restoreFromPhrase.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({
      password       : 'password',
      recoveryPhrase : 'recovery phrase',
    }));
    expect(options).not.toHaveProperty('dwnEndpoints');
  });

  it('normalizes recovery endpoints and rejects unsafe values before the SDK call', async () => {
    const auth = {
      restoreFromPhrase: vi.fn(async () => ({ agent: {} })),
    };

    await runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
      ['https://DWN.Example/path/'],
    ));
    expect(auth.restoreFromPhrase).toHaveBeenCalledWith(expect.objectContaining({
      dwnEndpoints: ['https://dwn.example/path'],
    }));

    auth.restoreFromPhrase.mockClear();
    await expect(runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
      ['http://remote.example/dwn'],
    ))).rejects.toThrow('HTTPS');
    expect(auth.restoreFromPhrase).not.toHaveBeenCalled();
  });
});
