import { describe, expect, it, vi } from 'vitest';
import type { PermissionGrant } from '@enbox/api';
import { buildPermissionSections } from '../permission-sessions';

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

const session = {
  id        : 'session-1',
  createdAt : '2026-06-23T00:00:00.000Z',
  expiresAt : '2026-06-24T00:00:00.000Z',
  appName   : 'Example App',
  origin    : 'https://app.example',
  transport : 'postMessage' as const,
};

describe('permission session grouping', () => {
  it('groups active connect grants by session id', () => {
    const sections = buildPermissionSections([
      grant({ id: 'grant-1', connectSession: session } as Partial<PermissionGrant>),
      grant({ id: 'grant-2', connectSession: session } as Partial<PermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.activeSessions).toHaveLength(1);
    expect(sections.activeSessions[0]).toEqual(expect.objectContaining({
      id      : 'session-1',
      active  : true,
      grantee : 'did:dht:delegate',
    }));
    expect(sections.activeSessions[0].grants.map((item) => item.id)).toEqual([
      'grant-1',
      'grant-2',
    ]);
    expect(sections.inactiveSessions).toHaveLength(0);
    expect(sections.standaloneGroups).toHaveLength(0);
  });

  it('puts expired connect grants into inactive sessions', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'grant-1',
        dateExpires    : '2026-06-22T00:00:00.000Z',
        connectSession : {
          ...session,
          expiresAt: '2026-06-22T00:00:00.000Z',
        },
      } as Partial<PermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.activeSessions).toHaveLength(0);
    expect(sections.inactiveSessions).toHaveLength(1);
    expect(sections.inactiveSessions[0]).toEqual(expect.objectContaining({
      id     : 'session-1',
      active : false,
    }));
  });

  it('keeps grants without session metadata grouped by grantee', () => {
    const sections = buildPermissionSections([
      grant({ id: 'grant-1', grantee: 'did:dht:delegate-a' }),
      grant({ id: 'grant-2', grantee: 'did:dht:delegate-a' }),
      grant({ id: 'grant-3', grantee: 'did:dht:delegate-b' }),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.activeSessions).toHaveLength(0);
    expect(sections.inactiveSessions).toHaveLength(0);
    expect(sections.standaloneGroups).toEqual([
      {
        grantee : 'did:dht:delegate-a',
        grants  : expect.arrayContaining([
          expect.objectContaining({ id: 'grant-1' }),
          expect.objectContaining({ id: 'grant-2' }),
        ]),
      },
      {
        grantee : 'did:dht:delegate-b',
        grants  : [expect.objectContaining({ id: 'grant-3' })],
      },
    ]);
  });
});
