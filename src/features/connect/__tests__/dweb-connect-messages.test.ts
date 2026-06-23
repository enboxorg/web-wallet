import { describe, expect, it } from 'vitest';

import {
  getUnsupportedConnectPermissionError,
  isDWebConnectRequestEvent,
  normalizeTrustedOrigin,
  referrerOrigin,
  sanitizeDWebConnectRequest,
} from '../dweb-connect-messages';
import type { DWebConnectRequest } from '@/stores/dweb-connect-store';

const permissionRequest = {
  protocolDefinition: {
    protocol: 'https://example.com/protocols/demo',
    types: {},
    structure: {},
  },
  permissionScopes: [
    {
      interface: 'Records',
      method: 'Read',
      protocol: 'https://example.com/protocols/demo',
    },
  ],
};

function request(overrides?: Partial<DWebConnectRequest>): DWebConnectRequest {
  return {
    origin: 'https://app.example',
    timestamp: 1,
    data: {
      type: 'dweb-connect-authorization-request',
      permissions: [permissionRequest],
      appName: 'Example App',
      appIcon: '/icon.png',
      ephemeralPublicKey: 'public-key',
      did: 'did:dht:alice',
    },
    ...overrides,
  };
}

describe('DWeb Connect message hardening', () => {
  it('accepts HTTPS and local HTTP origins only', () => {
    expect(normalizeTrustedOrigin('https://app.example')).toBe('https://app.example');
    expect(normalizeTrustedOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(normalizeTrustedOrigin('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173');
    expect(normalizeTrustedOrigin('http://app.example')).toBeUndefined();
    expect(normalizeTrustedOrigin('null')).toBeUndefined();
    expect(normalizeTrustedOrigin('not a url')).toBeUndefined();
  });

  it('extracts a trusted referrer origin for the loaded handshake', () => {
    expect(referrerOrigin('https://app.example/path?q=1')).toBe('https://app.example');
    expect(referrerOrigin('http://localhost:3000/page')).toBe('http://localhost:3000');
    expect(referrerOrigin('http://app.example/page')).toBeUndefined();
  });

  it('sanitizes valid authorization requests', () => {
    const sanitized = sanitizeDWebConnectRequest(request({
      data: {
        type: 'dweb-connect-authorization-request',
        permissions: [permissionRequest],
        appName: 'Example App',
        appIcon: '/icon.png',
        ephemeralPublicKey: 'public-key',
        did: 'did:dht:alice',
        clientMetadata: {
          origin: 'https://spoofed.example',
          userAgent: 'ExampleBrowser/1.0',
          platform: 'MacIntel',
          language: 'en-US',
          languages: ['en-US', 'en'],
          timezone: 'America/New_York',
        },
      },
    }));

    expect(sanitized).toEqual(expect.objectContaining({
      origin: 'https://app.example',
      permissions: [permissionRequest],
      appName: 'Example App',
      appIcon: 'https://app.example/icon.png',
      ephemeralPublicKey: 'public-key',
      requestedDid: 'did:dht:alice',
      clientMetadata: {
        origin: 'https://app.example',
        userAgent: 'ExampleBrowser/1.0',
        platform: 'MacIntel',
        language: 'en-US',
        languages: ['en-US', 'en'],
        timezone: 'America/New_York',
      },
    }));
  });

  it('rejects malformed or opaque-origin requests', () => {
    expect(sanitizeDWebConnectRequest(request({ origin: 'null' }))).toBeUndefined();
    expect(sanitizeDWebConnectRequest(request({
      data: { type: 'dweb-connect-authorization-request', permissions: [] },
    }))).toBeUndefined();
    expect(sanitizeDWebConnectRequest(request({
      data: { type: 'other', permissions: [permissionRequest] },
    }))).toBeUndefined();
  });

  it('drops unsafe optional presentation fields but keeps the request', () => {
    const sanitized = sanitizeDWebConnectRequest(request({
      data: {
        type: 'dweb-connect-authorization-request',
        permissions: [permissionRequest],
        appName: 'x'.repeat(200),
        appIcon: 'javascript:alert(1)',
        did: 'not a did',
      },
    }));

    expect(sanitized).toBeDefined();
    expect(sanitized?.appName).toBeUndefined();
    expect(sanitized?.appIcon).toBeUndefined();
    expect(sanitized?.requestedDid).toBeUndefined();
  });

  it('reports removed read-like record scopes as unsupported', () => {
    for (const method of ['Query', 'Subscribe', 'Count']) {
      expect(getUnsupportedConnectPermissionError([{
        protocolDefinition: permissionRequest.protocolDefinition,
        permissionScopes: [{
          interface: 'Records',
          method,
          protocol: 'https://example.com/protocols/demo',
        }],
      } as any])).toBe(
        `Records.${method} is no longer supported in DWeb Connect. The app must request Records.Read instead.`,
      );
    }
  });

  it('reports delegated protocol configure as unsupported', () => {
    expect(getUnsupportedConnectPermissionError([{
      protocolDefinition: permissionRequest.protocolDefinition,
      permissionScopes: [{
        interface: 'Protocols',
        method: 'Configure',
        protocol: 'https://example.com/protocols/demo',
      }],
    } as any])).toBe(
      'Protocols.Configure cannot be delegated through DWeb Connect. The wallet configures protocols during approval.',
    );
  });

  it('allows current connect support and record scopes', () => {
    expect(getUnsupportedConnectPermissionError([{
      protocolDefinition: permissionRequest.protocolDefinition,
      permissionScopes: [
        {
          interface: 'Protocols',
          method: 'Query',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Messages',
          method: 'Read',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Records',
          method: 'Write',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Records',
          method: 'Delete',
          protocol: 'https://example.com/protocols/demo',
        },
      ],
    } as any])).toBeUndefined();
  });

  it('requires messages to come from the opener and active origin', () => {
    const opener = window;
    const valid = new MessageEvent('message', {
      origin: 'https://app.example',
      source: opener,
      data: { type: 'dweb-connect-authorization-request' },
    });
    const wrongOrigin = new MessageEvent('message', {
      origin: 'https://evil.example',
      source: opener,
      data: { type: 'dweb-connect-authorization-request' },
    });
    const wrongSource = new MessageEvent('message', {
      origin: 'https://app.example',
      source: null,
      data: { type: 'dweb-connect-authorization-request' },
    });

    expect(isDWebConnectRequestEvent(valid, opener, '')).toBe(true);
    expect(isDWebConnectRequestEvent(valid, opener, 'https://app.example')).toBe(true);
    expect(isDWebConnectRequestEvent(wrongOrigin, opener, 'https://app.example')).toBe(false);
    expect(isDWebConnectRequestEvent(wrongSource, opener, '')).toBe(false);
  });
});
