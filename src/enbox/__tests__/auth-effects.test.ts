import { describe, expect, it, vi } from 'vitest';

import {
  connectVaultEffect,
  restoreFromPhraseEffect,
} from '../auth-effects';
import { runEnboxPromise } from '../effect/runtime';

describe('wallet auth effects', () => {
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

  it('omits recovery endpoints when no replacement is requested', async () => {
    const auth = {
      restoreFromPhrase: vi.fn(async () => ({ agent: {} })),
    };

    await runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
    ));

    expect(auth.restoreFromPhrase).toHaveBeenCalledWith({
      password              : 'password',
      recoveryPhrase        : 'recovery phrase',
      identitySyncProtocols : expect.any(Array),
    });
  });
});
