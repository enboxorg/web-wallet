import { describe, expect, it, vi } from 'vitest';
import type { PermissionGrant } from '@enbox/api';
import { findMatchingActiveConnectSessions } from '../existing-connect-sessions';

const baseSession = {
  id        : 'session-1',
  createdAt : '2026-06-23T00:00:00.000Z',
  expiresAt : '2026-06-24T00:00:00.000Z',
  appName   : 'Example App',
  origin    : 'https://app.example',
  transport : 'postMessage' as const,
};

function grant(overrides: Partial<PermissionGrant> = {}): PermissionGrant {
  return {
    id          : overrides.id ?? 'grant-1',
    grantee     : overrides.grantee ?? 'did:dht:delegate',
    dateGranted : overrides.dateGranted ?? '2026-06-23T00:00:00.000Z',
    dateExpires : overrides.dateExpires ?? '2026-06-24T00:00:00.000Z',
    scope       : overrides.scope ?? {
      interface : 'Records',
      method    : 'Read',
      protocol  : 'https://example.com/protocols/demo',
    },
    revoke: vi.fn(),
    ...overrides,
  } as PermissionGrant;
}

describe('findMatchingActiveConnectSessions', () => {
  it('matches active sessions by origin', () => {
    const sessions = findMatchingActiveConnectSessions([
      grant({ connectSession: baseSession } as Partial<PermissionGrant>),
    ], {
      origin: 'https://app.example',
    }, new Date('2026-06-23T12:00:00.000Z'));

    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('session-1');
  });

  it('matches active sessions by app name when origin is unavailable', () => {
    const sessions = findMatchingActiveConnectSessions([
      grant({
        connectSession: {
          ...baseSession,
          origin: undefined,
        },
      } as Partial<PermissionGrant>),
    ], {
      appName: 'Example App',
    }, new Date('2026-06-23T12:00:00.000Z'));

    expect(sessions).toHaveLength(1);
  });

  it('does not include expired or unrelated sessions', () => {
    const sessions = findMatchingActiveConnectSessions([
      grant({
        id             : 'expired',
        dateExpires    : '2026-06-22T00:00:00.000Z',
        connectSession : {
          ...baseSession,
          id        : 'expired-session',
          expiresAt : '2026-06-22T00:00:00.000Z',
        },
      } as Partial<PermissionGrant>),
      grant({
        id             : 'unrelated',
        connectSession : {
          ...baseSession,
          id     : 'unrelated-session',
          origin : 'https://other.example',
        },
      } as Partial<PermissionGrant>),
    ], {
      origin  : 'https://app.example',
      appName : 'Example App',
    }, new Date('2026-06-23T12:00:00.000Z'));

    expect(sessions).toHaveLength(0);
  });
});
