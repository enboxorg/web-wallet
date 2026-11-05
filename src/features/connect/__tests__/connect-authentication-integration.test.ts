import type { ConnectRequest } from '@enbox/connect';
import type { EnboxAgent } from '@/enbox/types';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DidJwk } from '@enbox/dids';
import { CryptoUtils, X25519 } from '@enbox/crypto';
import { openAuthenticationResponse, randomToken, sealRequest, verifyOwnerAuthenticationProof } from '@enbox/connect';

import { approveConnectRequest, approvePopupConnectRequest, fetchConnectRequest } from '../connect-kernel';

const ORIGIN = 'https://issuer.example';
const AUDIENCE = `${ORIGIN}/wallet-login`;

async function fixture(mode: 'popup' | 'relay') {
  const owner = await DidJwk.create();
  const client = await DidJwk.create();
  const responsePrivateKey = await X25519.generateKey();
  const request: ConnectRequest = {
    clientDid: client.uri,
    appName: 'Issuer integration fixture',
    requestType: 'authenticate',
    expectedProviderDid: owner.uri,
    authentication: { version: 1, audience: AUDIENCE, challenge: randomToken() },
    permissionRequests: [],
    supportedDidMethods: ['did:jwk'],
    nonce: randomToken(),
    state: randomToken(),
    responseKey: await X25519.computePublicKey({ key: responsePrivateKey }),
    reply: mode === 'popup'
      ? { mode: 'post_message' }
      : { mode: 'direct_post', callbackUrl: `${ORIGIN}/connect/callback` },
  };
  // Keep the owner identity/KMS and all SDK signing/envelope functions real.
  // Only the wallet's identity lookup and network boundary are controlled.
  const identityGet = vi.fn(async () => ({ did: owner, metadata: { name: 'Owner' } }));
  const processDwnRequest = vi.fn().mockRejectedValue(new Error('Authentication must not write to a DWN'));
  const sendDwnRequest = vi.fn().mockRejectedValue(new Error('Authentication must not contact a DWN'));
  const createGrant = vi.fn().mockRejectedValue(new Error('Authentication must not create a grant'));
  const exportOwner = vi.spyOn(owner, 'export').mockRejectedValue(new Error('Authentication must not export the owner'));
  const agent = {
    identity: { get: identityGet },
    permissions: { createGrant },
    processDwnRequest,
    sendDwnRequest,
  } as unknown as EnboxAgent;
  return { owner, client, request, responsePrivateKey, agent, identityGet, processDwnRequest, sendDwnRequest, createGrant, exportOwner };
}

describe('wallet authentication with the published SDK', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(['popup', 'relay'] as const)('returns a verifiable owner proof through the %s wallet flow without data authority', async (mode) => {
    const f = await fixture(mode);
    let jwe: string;
    const pin = mode === 'relay' ? '1234' : undefined;
    if (mode === 'popup') {
      jwe = await approvePopupConnectRequest(f.owner.uri, f.request, ORIGIN, 3600, f.agent);
    } else {
      const requestKey = CryptoUtils.randomBytes(32);
      const sealedRequest = await sealRequest({ request: f.request, signer: f.client, encryption: { mode: 'dir', requestKey } });
      const requestUri = `${ORIGIN}/connect/authorize/registered.jwt`;
      let posted: URLSearchParams | undefined;
      const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === requestUri) {
          expect(init?.redirect).toBe('error');
          return new Response(sealedRequest);
        }
        expect(String(input)).toBe(`${ORIGIN}/connect/callback`);
        expect(init?.method).toBe('POST');
        posted = new URLSearchParams(String(init?.body));
        return new Response(null, { status: 201 });
      });
      vi.stubGlobal('fetch', fetch);
      const fetched = await fetchConnectRequest(requestUri, requestKey);
      const approved = await approveConnectRequest(f.owner.uri, fetched, pin!, 3600, f.agent);
      expect(approved).toEqual(f.request);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(posted?.get('state')).toBe(f.request.state);
      jwe = posted!.get('id_token')!;
    }

    const response = await openAuthenticationResponse({
      jwe, pin, recipientPrivateKey: f.responsePrivateKey,
      expected: { clientDid: f.client.uri, nonce: f.request.nonce, state: f.request.state, providerDid: f.owner.uri },
    });
    const verified = await verifyOwnerAuthenticationProof({
      proof: response.authenticationProof, request: f.request, providerDid: f.owner.uri,
      expected: { audience: AUDIENCE, challenge: f.request.authentication!.challenge },
    });
    expect(verified.subject).toBe(f.owner.uri);
    expect(verified.audience).toBe(AUDIENCE);
    expect(response).not.toHaveProperty('delegateDid');
    expect(response).not.toHaveProperty('delegateGrants');
    expect(response).not.toHaveProperty('delegatePortableDid');
    expect(f.identityGet).toHaveBeenCalledWith({ didUri: f.owner.uri });
    expect(f.processDwnRequest).not.toHaveBeenCalled();
    expect(f.sendDwnRequest).not.toHaveBeenCalled();
    expect(f.createGrant).not.toHaveBeenCalled();
    expect(f.exportOwner).not.toHaveBeenCalled();
  });
});
