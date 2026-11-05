import { describe, expect, it, vi } from 'vitest';

import {
  connectVaultEffect,
  resolveProviderAuthEffect,
  restoreFromPhraseEffect,
  restoreSessionEffect,
} from '../auth-effects';
import { runEnboxPromise } from '../effect/runtime';

function legacyOwnerFixture(identities: Array<{ metadata: { connectedDid?: string } }> = [{ metadata: {} }]) {
  const lifetime = new AbortController();
  const agent = {
    agentDid: { metadata: { published: true } },
    identity: { list: vi.fn().mockResolvedValue(identities) },
  };
  const session = { agent, did: 'did:example:existing-owner', signal: new AbortController().signal };
  const auth = {
    isLocked: true,
    agent,
    vault: {
      isInitialized: vi.fn().mockResolvedValue(true),
      getPendingSetup: vi.fn().mockResolvedValue(undefined),
    },
    restoreSession: vi.fn().mockResolvedValue(undefined),
    connectHeadless: vi.fn(),
    connectVault: vi.fn(),
    lock: vi.fn(),
  };
  auth.connectHeadless.mockImplementation(async () => {
    auth.isLocked = false;
    if (identities.length === 0) throw new Error('[@enbox/auth] No identities found in vault.');
    return { ...session, signal: lifetime.signal };
  });
  auth.connectVault.mockImplementation(async () => {
    lifetime.abort(); // Committing the replacement ends the headless lifetime.
    return session;
  });
  auth.lock.mockImplementation(async () => {
    lifetime.abort();
    auth.isLocked = true;
  });
  return { auth, session, lifetime };
}

describe('wallet auth effects', () => {
  it('reopens an initialized locked owner vault when a pre-upgrade session has no current record', async () => {
    const { auth, session } = legacyOwnerFixture();

    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'existing-password'))).resolves.toBe(session);
    expect(auth.restoreSession).toHaveBeenCalledWith({ password: 'existing-password' });
    expect(auth.connectHeadless).toHaveBeenCalledWith({ password: 'existing-password' });
    expect(auth.connectVault).toHaveBeenCalledWith({ password: 'existing-password', createIdentity: false });
  });

  it('supports a completed agent-only wallet without creating its first profile', async () => {
    const { auth, session } = legacyOwnerFixture([]);
    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).resolves.toBe(session);
    expect(auth.connectVault).toHaveBeenCalledWith({ password: 'password', createIdentity: false });
  });

  it('locks and rejects delegated inventories, incomplete setup, and unpublished vaults before reconnecting', async () => {
    const delegated = legacyOwnerFixture([{ metadata: { connectedDid: 'did:example:external-owner' } }]).auth;
    const pending = legacyOwnerFixture([]).auth;
    pending.vault.getPendingSetup.mockResolvedValue({ registrationRequired: true });
    const unpublished = legacyOwnerFixture([]).auth;
    unpublished.agent.agentDid.metadata.published = false;
    for (const auth of [delegated, pending, unpublished]) {
      await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).rejects.toThrow();
      expect(auth.connectVault).not.toHaveBeenCalled();
      expect(auth.lock).toHaveBeenCalledOnce();
      expect(auth.isLocked).toBe(true);
    }
  });

  it('does not treat unrelated headless failures as an empty owner inventory', async () => {
    const { auth } = legacyOwnerFixture([]);
    auth.connectHeadless.mockRejectedValue(new Error('Unreadable identity store'));
    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).rejects.toThrow('Unreadable identity store');
    expect(auth.connectVault).not.toHaveBeenCalled();
    expect(auth.agent.identity.list).not.toHaveBeenCalled();
  });

  it('honors operation cancellation and headless session invalidation before starting a replacement connection', async () => {
    for (const kind of ['operation', 'session'] as const) {
      const { auth, lifetime } = legacyOwnerFixture();
      const operation = new AbortController();
      let enter!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => { enter = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      auth.agent.identity.list.mockImplementation(async () => {
        enter();
        await gate;
        return [{ metadata: {} }];
      });
      const pending = runEnboxPromise(restoreSessionEffect(auth as any, 'password', operation.signal));
      await entered;
      (kind === 'operation' ? operation : lifetime).abort(new Error('Authentication cancelled'));
      release();
      await expect(pending).rejects.toThrow('Authentication cancelled');
      expect(auth.connectVault).not.toHaveBeenCalled();
    }
  });

  it('keeps a successfully restored session without opening a new vault session', async () => {
    const session = { agent: {}, did: 'did:example:existing-owner' };
    const auth = {
      restoreSession: vi.fn().mockResolvedValue(session),
      connectVault: vi.fn(),
      vault: { isInitialized: vi.fn() },
    };
    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).resolves.toBe(session);
    expect(auth.connectVault).not.toHaveBeenCalled();
    expect(auth.vault.isInitialized).not.toHaveBeenCalled();
  });

  it('does not create a vault or revive a restore that already unlocked but returned no session', async () => {
    for (const [isLocked, initialized] of [[true, false], [false, true]]) {
      const auth = {
        isLocked,
        vault: { isInitialized: vi.fn().mockResolvedValue(initialized) },
        restoreSession: vi.fn().mockResolvedValue(undefined),
        connectVault: vi.fn(),
      };
      await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).resolves.toBeUndefined();
      expect(auth.connectVault).not.toHaveBeenCalled();
    }
  });

  it('preserves wrong-password and corrupt-session failures without falling back', async () => {
    for (const message of ['Incorrect password', 'AuthManager: Persisted session is invalid.']) {
      const auth = {
        isLocked: true,
        vault: { isInitialized: vi.fn().mockResolvedValue(true) },
        restoreSession: vi.fn().mockRejectedValue(new Error(message)),
        connectVault: vi.fn(),
      };
      await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'password'))).rejects.toThrow(message);
      expect(auth.connectVault).not.toHaveBeenCalled();
      expect(auth.vault.isInitialized).not.toHaveBeenCalled();
    }
  });

  it('requires the original password when opening a legacy owner vault', async () => {
    const { auth } = legacyOwnerFixture();
    auth.connectHeadless.mockRejectedValue(new Error('Incorrect password'));
    await expect(runEnboxPromise(restoreSessionEffect(auth as any, 'wrong-password'))).rejects.toThrow('Incorrect password');
    expect(auth.connectHeadless).toHaveBeenCalledWith({ password: 'wrong-password' });
    expect(auth.connectVault).not.toHaveBeenCalled();
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
