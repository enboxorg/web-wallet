// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AuthManager, MemoryStorage } from '@enbox/browser';
import { describe, expect, it, vi } from 'vitest';

import { restoreSessionEffect } from '../auth-effects';
import { runEnboxPromise } from '../effect/runtime';

describe('published SDK owner-vault session upgrade', () => {
  for (const ownerCount of [0, 2]) {
    it(`reopens legacy metadata with ${ownerCount} existing profiles and restores the next session normally`, async () => {
      const dataPath = await mkdtemp(join(tmpdir(), 'enbox-wallet-owner-upgrade-'));
      const storage = new MemoryStorage();
      const password = 'synthetic-owner-upgrade-password';
      const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected external request'));
      const auth = await AuthManager.create({ dataPath, storage, sync: 'off', localDwnStrategy: 'off' });
      try {
        // Isolate only DID publication. Vault encryption, key storage, DID
        // possession, session persistence and every auth operation remain real.
        auth.vault.didResolver = {
          resolve: async () => ({ didDocument: null, didDocumentMetadata: {}, didResolutionMetadata: { error: 'notFound' } }),
          publish: async ({ did }) => ({
            didDocument: did.document,
            didDocumentMetadata: { published: true },
            didRegistrationMetadata: {},
          }),
        };
        const original = await auth.connectVault({
          password, createIdentity: false, dwnEndpoints: ['https://existing-dwn.example'],
        });
        for (let i = 0; i < ownerCount; i++) {
          await auth.agent.identity.create({ didMethod: 'jwk', metadata: { name: `Synthetic owner ${i}` } });
        }
        const agentDocument = structuredClone(auth.agent.agentDid.document);
        const ownerDocuments = (await auth.agent.identity.list()).map((identity) => identity.did.document);
        await auth.agent.secrets.put('synthetic:upgrade', new TextEncoder().encode('preserved encrypted data'));

        // Exact non-secret marker format written by the formerly pinned SDK.
        await storage.remove('enbox:auth:session');
        await storage.set('enbox:auth:previouslyConnected', 'true');
        await storage.set('enbox:auth:activeIdentity', original.did);
        await auth.lock();

        const createIdentity = vi.spyOn(auth.agent.identity, 'create');
        const serverInfo = vi.spyOn(auth.agent.rpc, 'getServerInfo');
        const connectVault = vi.spyOn(auth, 'connectVault');
        const headless = vi.spyOn(auth, 'connectHeadless');
        const reopened = await runEnboxPromise(restoreSessionEffect(auth, password));
        expect(reopened).toBeDefined();
        expect(reopened!.delegateDid).toBeUndefined();
        expect(auth.agent.agentDid.document).toEqual(agentDocument);
        const identities = await auth.agent.identity.list();
        expect(identities.map((identity) => identity.did.document)).toEqual(ownerDocuments);
        expect(new TextDecoder().decode(await auth.agent.secrets.get('synthetic:upgrade'))).toBe('preserved encrypted data');
        const message = new TextEncoder().encode('synthetic key possession check');
        for (const did of [auth.agent.agentDid, ...identities.map((identity) => identity.did)]) {
          const signer = await did.getSigner();
          expect(await signer.verify({ data: message, signature: await signer.sign({ data: message }) })).toBe(true);
        }
        expect(connectVault).toHaveBeenCalledWith({ password, createIdentity: false });
        expect(await storage.get('enbox:auth:session')).not.toBeNull();

        await auth.lock();
        const restored = await runEnboxPromise(restoreSessionEffect(auth, password));
        expect(restored!.did).toBe(reopened!.did);
        expect(auth.agent.agentDid.document).toEqual(agentDocument);
        expect(connectVault).toHaveBeenCalledOnce();
        expect(headless).toHaveBeenCalledOnce();
        expect(createIdentity).not.toHaveBeenCalled();
        expect(serverInfo).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        await auth.shutdown();
        vi.restoreAllMocks();
        await rm(dataPath, { recursive: true, force: true });
      }
    });
  }
});
