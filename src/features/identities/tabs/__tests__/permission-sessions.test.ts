import { describe, expect, it } from 'vitest';
import type { DwnPermissionGrant } from '@enbox/agent';
import { buildPermissionSections, countActivePermissionApps } from '../permission-sessions';

function grant(overrides: Partial<DwnPermissionGrant> = {}): DwnPermissionGrant {
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
    ...overrides,
  } as DwnPermissionGrant;
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
  it('groups grants from one approval into a stable delegate session', () => {
    const sections = buildPermissionSections([
      grant({ id: 'grant-1', connectSession: session } as Partial<DwnPermissionGrant>),
      grant({ id: 'grant-2', connectSession: session } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.activeSessions).toHaveLength(1);
    expect(sections.activeSessions[0]).toEqual(expect.objectContaining({
      id      : 'did:dht:delegate',
      active  : true,
      grantee : 'did:dht:delegate',
    }));
    expect(sections.activeSessions[0].bundles).toEqual([
      expect.objectContaining({ id: 'session-1' }),
    ]);
    expect(sections.activeSessions[0].grants.map((item) => item.id)).toEqual([
      'grant-1',
      'grant-2',
    ]);
    expect(sections.inactiveSessions).toHaveLength(0);
    expect(sections.applications).toEqual([
      expect.objectContaining({
        name               : 'Example App',
        origin             : 'https://app.example',
        identityTrust      : 'verified-origin',
        activeSessionCount : 1,
        permissionCount    : 2,
        sessions           : [expect.objectContaining({ id: 'did:dht:delegate' })],
      }),
    ]);
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
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.activeSessions).toHaveLength(0);
    expect(sections.inactiveSessions).toHaveLength(1);
    expect(sections.inactiveSessions[0]).toEqual(expect.objectContaining({
      id     : 'did:dht:delegate',
      active : false,
    }));
    expect(sections.applications[0]).toEqual(expect.objectContaining({
      activeSessionCount : 0,
      permissionCount    : 1,
    }));
  });

  it('groups active and expired sessions by normalized web origin', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'active-grant',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'active-session',
          origin        : 'HTTPS://APP.EXAMPLE:443/connect',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'expired-grant',
        grantee        : 'did:dht:expired-delegate',
        dateExpires    : '2026-06-22T00:00:00.000Z',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'expired-session',
          origin        : 'https://app.example/another-path',
          expiresAt     : '2026-06-22T00:00:00.000Z',
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toHaveLength(1);
    expect(sections.applications[0]).toEqual(expect.objectContaining({
      applicationId      : 'com.example.notes',
      origin             : 'https://app.example',
      identityTrust      : 'verified-origin',
      activeSessionCount : 1,
      permissionCount    : 2,
    }));
    expect(sections.applications[0].sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'did:dht:delegate', active: true }),
      expect.objectContaining({ id: 'did:dht:expired-delegate', active: false }),
    ]));
  });

  it('nests renewed approval bundles under one stable delegate session', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'grant-original',
        dateExpires    : '2026-06-24T00:00:00.000Z',
        connectSession : {
          ...session,
          id        : 'approval-original',
          createdAt : '2026-06-23T10:00:00.000Z',
          expiresAt : '2026-06-24T00:00:00.000Z',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-renewed',
        dateExpires    : '2026-07-01T00:00:00.000Z',
        connectSession : {
          ...session,
          id        : 'approval-renewed',
          createdAt : '2026-06-23T11:00:00.000Z',
          expiresAt : '2026-07-01T00:00:00.000Z',
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toHaveLength(1);
    expect(sections.applications[0].sessions).toHaveLength(1);
    expect(sections.applications[0].sessions[0]).toEqual(expect.objectContaining({
      id          : 'did:dht:delegate',
      dateGranted : '2026-06-23T10:00:00.000Z',
      lastRenewed : '2026-06-23T11:00:00.000Z',
      grants      : expect.arrayContaining([
        expect.objectContaining({ id: 'grant-original' }),
        expect.objectContaining({ id: 'grant-renewed' }),
      ]),
    }));
    expect(sections.applications[0].sessions[0].bundles.map((bundle) => bundle.id)).toEqual([
      'approval-renewed',
      'approval-original',
    ]);
  });

  it('uses web origin before a self-reported application ID', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'grant-a',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'session-a',
          origin        : 'https://one.example',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-b',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'session-b',
          origin        : 'https://two.example',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-c',
        connectSession : {
          ...session,
          applicationId : 'com.example.tasks',
          id            : 'session-c',
          origin        : 'https://one.example',
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toHaveLength(2);
    expect(sections.applications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        origin   : 'https://one.example',
        sessions : [expect.objectContaining({
          id      : 'did:dht:delegate',
          bundles : expect.arrayContaining([
            expect.objectContaining({ id: 'session-a' }),
            expect.objectContaining({ id: 'session-c' }),
          ]),
        })],
      }),
      expect.objectContaining({
        origin   : 'https://two.example',
        sessions : [expect.objectContaining({
          id      : 'did:dht:delegate',
          bundles : [expect.objectContaining({ id: 'session-b' })],
        })],
      }),
    ]));
  });

  it('uses normalized stored origins when an application ID is unavailable', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'grant-a',
        connectSession : {
          ...session,
          id     : 'session-a',
          origin : 'https://APP.example:443/path',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-b',
        connectSession : {
          ...session,
          id     : 'session-b',
          origin : 'https://app.example',
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toHaveLength(1);
    expect(sections.applications[0]).toEqual(expect.objectContaining({
      origin        : 'https://app.example',
      identityTrust : 'verified-origin',
      sessions      : [expect.objectContaining({
        id      : 'did:dht:delegate',
        bundles : expect.arrayContaining([
          expect.objectContaining({ id: 'session-a' }),
          expect.objectContaining({ id: 'session-b' }),
        ]),
      })],
    }));
  });

  it('groups reverse-domain native app IDs when no web origin is available', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'grant-a',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'session-a',
          origin        : undefined,
          transport     : 'relay',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-b',
        grantee        : 'did:dht:other-delegate',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'session-b',
          origin        : undefined,
          transport     : 'relay',
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toEqual([
      expect.objectContaining({
        applicationId : 'com.example.notes',
        identityTrust : 'reported',
        sessions      : expect.arrayContaining([
          expect.objectContaining({ id: 'did:dht:delegate' }),
          expect.objectContaining({ id: 'did:dht:other-delegate' }),
        ]),
      }),
    ]);
  });

  it('keeps relay-reported metadata separate from a verified popup app', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'popup-grant',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'popup-session',
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'relay-grant',
        connectSession : {
          ...session,
          applicationId : 'com.example.notes',
          id            : 'relay-session',
          transport     : 'relay',
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toHaveLength(2);
    expect(sections.applications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id            : 'verified-origin:origin:https://app.example',
        identityTrust : 'verified-origin',
        sessions      : [expect.objectContaining({
          id      : 'did:dht:delegate',
          bundles : [expect.objectContaining({ id: 'popup-session' })],
        })],
      }),
      expect.objectContaining({
        id            : 'reported:origin:https://app.example',
        identityTrust : 'reported',
        sessions      : [expect.objectContaining({
          id      : 'did:dht:delegate',
          bundles : [expect.objectContaining({ id: 'relay-session' })],
        })],
      }),
    ]));
  });

  it('isolates legacy sessions that only share a self-reported app name', () => {
    const sections = buildPermissionSections([
      grant({
        id             : 'grant-a',
        connectSession : {
          ...session,
          id     : 'session-a',
          origin : undefined,
        },
      } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-b',
        grantee        : 'did:dht:other-delegate',
        connectSession : {
          ...session,
          id     : 'session-b',
          origin : undefined,
        },
      } as Partial<DwnPermissionGrant>),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.applications).toHaveLength(2);
    expect(sections.applications.every((application) => application.name === 'Example App')).toBe(true);
    expect(sections.applications.map((application) => application.sessions)).toEqual([
      [expect.objectContaining({ id: 'did:dht:delegate' })],
      [expect.objectContaining({ id: 'did:dht:other-delegate' })],
    ]);
  });

  it('keeps grants without session metadata grouped by grantee', () => {
    const sections = buildPermissionSections([
      grant({ id: 'grant-1', grantee: 'did:dht:delegate-a' }),
      grant({ id: 'grant-2', grantee: 'did:dht:delegate-a' }),
      grant({ id: 'grant-3', grantee: 'did:dht:delegate-b' }),
    ], new Date('2026-06-23T12:00:00.000Z'));

    expect(sections.activeSessions).toHaveLength(0);
    expect(sections.inactiveSessions).toHaveLength(0);
    expect(sections.applications).toHaveLength(0);
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

describe('countActivePermissionApps', () => {
  const now = new Date('2026-06-23T12:00:00.000Z');

  it('counts each app once across multiple active sessions and grants', () => {
    const count = countActivePermissionApps([
      grant({ id: 'grant-1', connectSession: session } as Partial<DwnPermissionGrant>),
      grant({ id: 'grant-2', connectSession: session } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-3',
        grantee        : 'did:dht:other-delegate',
        connectSession : { ...session, id: 'session-2' },
      } as Partial<DwnPermissionGrant>),
    ], now);

    expect(count).toBe(1);
  });

  it('counts distinct apps and standalone grantees separately', () => {
    const count = countActivePermissionApps([
      grant({ id: 'grant-1', connectSession: session } as Partial<DwnPermissionGrant>),
      grant({
        id             : 'grant-2',
        connectSession : {
          ...session,
          id     : 'session-2',
          appName: 'Another App',
          origin : 'https://another.example',
        },
      } as Partial<DwnPermissionGrant>),
      grant({ id: 'grant-3', grantee: 'did:dht:standalone' }),
    ], now);

    expect(count).toBe(3);
  });

  it('ignores apps whose sessions all expired and expired standalone grants', () => {
    const count = countActivePermissionApps([
      grant({
        id             : 'grant-1',
        dateExpires    : '2026-06-22T00:00:00.000Z',
        connectSession : { ...session, expiresAt: '2026-06-22T00:00:00.000Z' },
      } as Partial<DwnPermissionGrant>),
      grant({
        id          : 'grant-2',
        grantee     : 'did:dht:standalone',
        dateExpires : '2026-06-22T00:00:00.000Z',
      }),
      grant({
        id             : 'grant-3',
        connectSession : { ...session, id: 'session-live' },
      } as Partial<DwnPermissionGrant>),
    ], now);

    expect(count).toBe(1);
  });

  it('returns zero for empty or undefined permissions', () => {
    expect(countActivePermissionApps([], now)).toBe(0);
    expect(countActivePermissionApps(undefined, now)).toBe(0);
  });
});
