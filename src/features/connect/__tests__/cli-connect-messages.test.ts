import { describe, expect, it } from 'vitest';
import { DidJwk } from '@enbox/dids';

import {
  CLI_CONNECT_REQUEST_TYPE,
  isLoopbackCallbackUrl,
  parseCliConnectRequest,
} from '../cli-connect-messages';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeRequest(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

const REPO_PROTOCOL = 'https://enbox.id/protocols/forge/repo';

async function buildSignedRequest(overrides: Record<string, unknown> = {}) {
  const bearer = await DidJwk.create();
  const challenge = 'nonce-abc-123';
  const signer = await bearer.getSigner();
  const message = new TextEncoder().encode(`${CLI_CONNECT_REQUEST_TYPE}:${bearer.uri}:${challenge}`);
  const signature = await signer.sign({ data: message });

  return {
    bearer,
    request: {
      version     : 1,
      type        : CLI_CONNECT_REQUEST_TYPE,
      appName     : 'gitd',
      permissions : [{
        protocolDefinition : { protocol: REPO_PROTOCOL },
        permissionScopes   : [{ interface: 'Records', method: 'Write', protocol: REPO_PROTOCOL }],
      }],
      cliDid      : bearer.uri,
      challenge,
      cliProof    : toBase64Url(new Uint8Array(signature)),
      callbackUrl : 'http://127.0.0.1:7421/callback',
      ...overrides,
    },
  };
}

describe('isLoopbackCallbackUrl', () => {
  it('accepts http loopback hosts', () => {
    expect(isLoopbackCallbackUrl('http://127.0.0.1:7421/callback')).toBe(true);
    expect(isLoopbackCallbackUrl('http://localhost:9000/cb')).toBe(true);
  });

  it('rejects non-loopback and non-http URLs', () => {
    expect(isLoopbackCallbackUrl('https://evil.example.com/cb')).toBe(false);
    expect(isLoopbackCallbackUrl('http://example.com/cb')).toBe(false);
    expect(isLoopbackCallbackUrl('https://127.0.0.1/cb')).toBe(false);
    expect(isLoopbackCallbackUrl(undefined)).toBe(false);
    expect(isLoopbackCallbackUrl('not a url')).toBe(false);
  });
});

describe('parseCliConnectRequest', () => {
  it('accepts a well-formed, proof-signed request', async () => {
    const { request } = await buildSignedRequest();
    const parsed = await parseCliConnectRequest(encodeRequest(request));

    expect(parsed.type).toBe(CLI_CONNECT_REQUEST_TYPE);
    expect(parsed.appName).toBe('gitd');
    expect(parsed.cliDid).toBe(request.cliDid);
    expect(parsed.permissions).toHaveLength(1);
    expect(parsed.permissions[0].protocolDefinition.protocol).toBe(REPO_PROTOCOL);
    expect(parsed.callbackUrl).toBe('http://127.0.0.1:7421/callback');
  });

  it('tolerates a scheme-prefixed payload', async () => {
    const { request } = await buildSignedRequest();
    const parsed = await parseCliConnectRequest(`cli://connect/${encodeRequest(request)}`);
    expect(parsed.cliDid).toBe(request.cliDid);
  });

  it('accepts a pre-supplied delegateDid (CLI-owns-key mode)', async () => {
    const { request } = await buildSignedRequest({ delegateDid: 'did:dht:contributor1' });
    const parsed = await parseCliConnectRequest(encodeRequest(request));
    expect(parsed.delegateDid).toBe('did:dht:contributor1');
  });

  it('rejects an invalid delegateDid', async () => {
    const { request } = await buildSignedRequest({ delegateDid: 'not-a-did' });
    await expect(parseCliConnectRequest(encodeRequest(request))).rejects.toThrow(/delegateDid/i);
  });

  it('rejects a request with a tampered proof', async () => {
    const { request } = await buildSignedRequest({ challenge: 'different-after-signing' });
    await expect(parseCliConnectRequest(encodeRequest(request))).rejects.toThrow(/proof/i);
  });

  it('rejects a non-loopback callback before doing any work', async () => {
    const { request } = await buildSignedRequest({ callbackUrl: 'https://evil.example.com/cb' });
    await expect(parseCliConnectRequest(encodeRequest(request))).rejects.toThrow(/loopback/i);
  });

  it('rejects a request with no permissions', async () => {
    const { request } = await buildSignedRequest({ permissions: [] });
    await expect(parseCliConnectRequest(encodeRequest(request))).rejects.toThrow(/permission/i);
  });

  it('rejects an unrecognized request type', async () => {
    const { request } = await buildSignedRequest({ type: 'something-else' });
    await expect(parseCliConnectRequest(encodeRequest(request))).rejects.toThrow(/Unrecognized/i);
  });

  it('rejects an empty or undecodable request', async () => {
    await expect(parseCliConnectRequest(null)).rejects.toThrow(/Missing/i);
    await expect(parseCliConnectRequest('@@not-base64@@')).rejects.toThrow();
  });
});
