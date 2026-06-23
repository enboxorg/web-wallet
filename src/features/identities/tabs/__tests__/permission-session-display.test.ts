import { describe, expect, it } from 'vitest';
import type { ConnectSessionMetadata } from '@enbox/agent';
import type { PermissionSessionGroup } from '../permission-sessions';
import { describeConnectSession, sessionTitle } from '../permission-session-display';

const safariMacUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const chromeWindowsUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function session(overrides: Partial<ConnectSessionMetadata> = {}): ConnectSessionMetadata {
  return {
    id        : 'session-1',
    createdAt : '2026-06-23T00:00:00.000Z',
    expiresAt : '2026-06-24T00:00:00.000Z',
    origin    : 'https://app.example',
    transport : 'postMessage',
    ...overrides,
  };
}

describe('permission session display', () => {
  it('summarizes Safari on macOS session metadata', () => {
    const summary = describeConnectSession(session({
      userAgent : safariMacUserAgent,
      platform  : 'MacIntel',
      language  : 'en-US',
      languages : ['en-US', 'en'],
      timezone  : 'America/New_York',
    }));

    expect(summary.title).toBe('Safari on macOS');
    expect(summary.device).toBe('Mac');
    expect(summary.browser).toBe('Safari');
    expect(summary.os).toBe('macOS');
    expect(summary.timezone).toBe('America/New_York');
    expect(summary.language).toBe('en-US');
    expect(summary.transport).toBe('Browser popup');
    expect(summary.technicalDetails).toEqual(expect.arrayContaining([
      { label: 'Session ID', value: 'session-1' },
      { label: 'Origin', value: 'https://app.example' },
      { label: 'User agent', value: safariMacUserAgent },
    ]));
  });

  it('summarizes Chrome on Windows relay sessions', () => {
    const summary = describeConnectSession(session({
      userAgent : chromeWindowsUserAgent,
      platform  : 'Win32',
      transport : 'relay',
      timezone  : 'Europe/London',
    }));

    expect(summary.title).toBe('Chrome on Windows');
    expect(summary.device).toBe('Windows PC');
    expect(summary.transport).toBe('Relay');
    expect(summary.timezone).toBe('Europe/London');
  });

  it('uses app, origin, then delegate DID for session titles', () => {
    const group = {
      session : session({ appName: 'Example App' }),
      grantee : 'did:dht:delegate123456789',
    } as PermissionSessionGroup;

    expect(sessionTitle(group)).toBe('Example App');
    expect(sessionTitle({
      ...group,
      session: session({ origin: 'https://origin.example' }),
    })).toBe('https://origin.example');
    expect(sessionTitle({
      ...group,
      session: session({ origin: undefined }),
    })).toContain('delegate');
  });
});
