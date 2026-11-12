import { describe, expect, it, vi } from 'vitest';

import {
  connectVaultEffect,
  resolveProviderAuthEffect,
  restoreFromPhraseEffect,
  restoreSessionEffect,
} from '../auth-effects';
import { runEnboxPromise } from '../effect/runtime';

describe('wallet auth effects', () => {
  it('returns a restored session directly without opening a new vault session', async () => {
    const session = { agent: {}, did: 'did:example:existing-owner' };
    const auth = {
      restoreSession : vi.fn().mockResolvedValue(session),
      connectVault   : vi.fn(),
    };

    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).resolves.toBe(session);
    expect(auth.restoreSession).toHaveBeenCalledWith({ password: 'password' });
    expect(auth.connectVault).not.toHaveBeenCalled();
  });

  it('returns undefined without falling back when no persisted session is restored', async () => {
    const auth = {
      restoreSession : vi.fn().mockResolvedValue(undefined),
      connectVault   : vi.fn(),
      vault          : { isInitialized: vi.fn() },
    };

    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).resolves.toBeUndefined();
    expect(auth.restoreSession).toHaveBeenCalledWith({ password: 'password' });
    expect(auth.connectVault).not.toHaveBeenCalled();
    expect(auth.vault.isInitialized).not.toHaveBeenCalled();
  });

  it('propagates wrong-password and corrupt-session failures from restoreSession', async () => {
    for (const message of ['Incorrect password', 'AuthManager: Persisted session is invalid.']) {
      const auth = {
        restoreSession : vi.fn().mockRejectedValue(new Error(message)),
        connectVault   : vi.fn(),
      };
      await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).rejects.toThrow(message);
      expect(auth.connectVault).not.toHaveBeenCalled();
    }
  });

  it('honors operation cancellation before and during restoreSession', async () => {
    const preAborted = new AbortController();
    preAborted.abort(new Error('Cancelled before start'));
    const untouchedAuth = {
      restoreSession: vi.fn(),
    };
    await expect(
      runEnboxPromise(restoreSessionEffect(untouchedAuth as any, 'password', preAborted.signal)),
    ).rejects.toThrow('Cancelled before start');
    expect(untouchedAuth.restoreSession).not.toHaveBeenCalled();

    const inFlight = new AbortController();
    let finishRestore!: (value: unknown) => void;
    const activeAuth = {
      restoreSession: vi.fn().mockReturnValue(new Promise((resolve) => {
        finishRestore = resolve;
      })),
    };
    const pending = runEnboxPromise(restoreSessionEffect(activeAuth as any, 'password', inFlight.signal));
    inFlight.abort(new Error('Authentication cancelled'));
    finishRestore({ agent: {}, did: 'did:example:existing-owner' });
    await expect(pending).rejects.toThrow('Authentication cancelled');
  });

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
    expect(auth.connectVault.mock.calls[0][0]).not.toHaveProperty('sync');
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
    expect(options).not.toHaveProperty('sync');
  });

  it('normalizes recovery endpoints and rejects unsafe values before the SDK call', async () => {
    const auth = {
      restoreFromPhrase: vi.fn(async () => ({ agent: {} })),
    };

    await runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
      { dwnEndpoints: ['https://DWN.Example/path/'] },
    ));
    expect(auth.restoreFromPhrase).toHaveBeenCalledWith(expect.objectContaining({
      dwnEndpoints: ['https://dwn.example/path'],
    }));

    auth.restoreFromPhrase.mockClear();
    await expect(runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
      { dwnEndpoints: ['http://remote.example/dwn'] },
    ))).rejects.toThrow('HTTPS');
    expect(auth.restoreFromPhrase).not.toHaveBeenCalled();
  });

  it('forwards the vault password commit boundary to phrase recovery', async () => {
    const onVaultPasswordCommitted = vi.fn();
    const auth = {
      restoreFromPhrase: vi.fn(async () => ({ agent: {} })),
    };

    await runEnboxPromise(restoreFromPhraseEffect(
      auth as any,
      'recovery phrase',
      'password',
      { onVaultPasswordCommitted },
    ));

    expect(auth.restoreFromPhrase).toHaveBeenCalledWith(expect.objectContaining({
      onVaultPasswordCommitted,
    }));
  });
});
