import type { DwnPermissionGrant } from '@enbox/agent';
import { describe, expect, it } from 'vitest';

import type { ConnectPermissionRequest } from '@enbox/connect';

import {
  detectConnectRefresh,
  refreshRequestSummary,
  splitRefreshAccess,
  type OwnerPermissionGrants,
} from '../connect-refresh';

const NOW = new Date('2026-07-13T12:00:00.000Z');

function grant({
  id = 'grant-1',
  ownerDid = 'did:dht:alice',
  delegateDid = 'did:jwk:delegate',
  sessionId = 'session-1',
  createdAt = '2026-07-13T10:00:00.000Z',
  dateGranted = createdAt,
  expiresAt = '2026-07-13T14:00:00.000Z',
  origin = 'https://app.example',
  appName = 'Example App',
}: {
  id?: string;
  ownerDid?: string;
  delegateDid?: string;
  sessionId?: string;
  createdAt?: string;
  dateGranted?: string;
  expiresAt?: string;
  origin?: string;
  appName?: string;
} = {}): DwnPermissionGrant {
  return {
    id,
    grantor     : ownerDid,
    grantee     : delegateDid,
    dateGranted,
    dateExpires : expiresAt,
    scope       : {
      interface : 'Records',
      method    : 'Read',
      module  : 'https://example.com/modules/tasks',
    },
    connectSession: {
      id: sessionId,
      createdAt,
      expiresAt,
      origin,
      appName,
      transport: 'postMessage',
    },
  } as DwnPermissionGrant;
}

function ownerPermissions(
  ownerDid = 'did:dht:alice',
  permissions: DwnPermissionGrant[] = [grant({ ownerDid })],
  revokedGrantIds: string[] = [],
): OwnerPermissionGrants[] {
  return [{ ownerDid, permissions, revokedGrantIds }];
}

describe('connect refresh detection', () => {
  it('does not infer refresh from an existing delegate when the signal is absent', () => {
    const detection = detectConnectRefresh(
      { delegateDid: 'did:jwk:delegate', appName: 'Example App' },
      ownerPermissions(),
      NOW,
    );

    expect(detection).toEqual({
      isRefresh : false,
      matchState: 'not-applicable',
      status    : 'none',
    });
  });

  it('pins the grantor only for an exact delegate-grantee match', () => {
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions(),
      NOW,
    );

    expect(detection).toEqual(expect.objectContaining({
      isRefresh      : true,
      matchState     : 'matched',
      pinnedOwnerDid : 'did:dht:alice',
      status         : 'active',
      expiresAt      : '2026-07-13T14:00:00.000Z',
    }));
  });

  it('never pins from a matching origin or app name alone', () => {
    const detection = detectConnectRefresh(
      {
        requestType : 'refresh',
        delegateDid : 'did:jwk:other-delegate',
        appName     : 'Example App',
        clientMetadata: { origin: 'https://app.example' },
      },
      ownerPermissions(),
      NOW,
    );

    expect(detection.matchState).toBe('not-found');
    expect(detection.pinnedOwnerDid).toBeUndefined();
  });

  it.each([
    ['2026-07-13T13:00:00.000Z', 'active'],
    ['2026-07-13T12:10:00.000Z', 'expiring-soon'],
    ['2026-07-13T12:00:00.000Z', 'expired'],
    ['2026-07-13T11:00:00.000Z', 'expired'],
  ] as const)('derives status from enforcing grant expiry %s', (expiresAt, status) => {
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions('did:dht:alice', [grant({ expiresAt })]),
      NOW,
    );

    expect(detection.status).toBe(status);
  });

  it('does not mark a fresh one-hour session as expiring soon', () => {
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions('did:dht:alice', [grant({
        createdAt : '2026-07-13T12:00:00.000Z',
        expiresAt : '2026-07-13T13:00:00.000Z',
      })]),
      new Date('2026-07-13T12:00:01.000Z'),
    );

    expect(detection.status).toBe('active');
  });

  it('honors an explicit expiring-soon threshold override', () => {
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions('did:dht:alice', [grant({ expiresAt: '2026-07-13T13:00:00.000Z' })]),
      NOW,
      60 * 60,
    );

    expect(detection.status).toBe('expiring-soon');
  });

  it('uses the newest session when the same owner refreshed the delegate before', () => {
    const older = grant({
      id          : 'grant-old',
      sessionId   : 'session-old',
      createdAt   : '2026-07-10T10:00:00.000Z',
      dateGranted : '2026-07-13T11:30:00.000Z',
      expiresAt   : '2026-07-14T10:00:00.000Z',
    });
    const newer = grant({
      id          : 'grant-new',
      sessionId   : 'session-new',
      createdAt   : '2026-07-13T11:00:00.000Z',
      dateGranted : '2026-07-13T10:30:00.000Z',
      expiresAt   : '2026-07-13T11:30:00.000Z',
    });

    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions('did:dht:alice', [older, newer]),
      NOW,
    );

    expect(detection.matchedSession?.id).toBe('did:jwk:delegate');
    expect(detection.matchedSession?.bundles[0].id).toBe('session-new');
    expect(detection.status).toBe('expired');
  });

  it('pins the exact owner and reports a fully revoked session from grant history', () => {
    const revokedGrant = grant({ id: 'revoked-grant' });
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions('did:dht:alice', [revokedGrant], ['revoked-grant']),
      NOW,
    );

    expect(detection).toEqual(expect.objectContaining({
      matchState     : 'matched',
      pinnedOwnerDid : 'did:dht:alice',
      status         : 'revoked',
    }));
  });

  it('reports changed permissions when only part of the latest bundle was revoked', () => {
    const activeGrant = grant({ id: 'active-grant' });
    const revokedGrant = grant({ id: 'revoked-grant' });
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      ownerPermissions(
        'did:dht:alice',
        [activeGrant, revokedGrant],
        ['revoked-grant'],
      ),
      NOW,
    );

    expect(detection).toEqual(expect.objectContaining({
      matchState     : 'matched',
      pinnedOwnerDid : 'did:dht:alice',
      status         : 'permissions-changed',
    }));
  });

  it('blocks renewal when the expected provider differs from the session owner', () => {
    const detection = detectConnectRefresh(
      {
        requestType         : 'refresh',
        delegateDid         : 'did:jwk:delegate',
        expectedProviderDid : 'did:dht:bob',
      },
      ownerPermissions(),
      NOW,
    );

    expect(detection).toEqual({
      isRefresh : true,
      matchState: 'profile-mismatch',
      status    : 'none',
    });
  });

  it('accepts renewal when the expected provider matches the session owner', () => {
    const detection = detectConnectRefresh(
      {
        requestType         : 'refresh',
        delegateDid         : 'did:jwk:delegate',
        expectedProviderDid : 'did:dht:alice',
      },
      ownerPermissions(),
      NOW,
    );

    expect(detection).toEqual(expect.objectContaining({
      matchState     : 'matched',
      pinnedOwnerDid : 'did:dht:alice',
    }));
  });

  it('uses the expected provider to disambiguate a delegate shared by multiple owners', () => {
    const detection = detectConnectRefresh(
      {
        requestType         : 'refresh',
        delegateDid         : 'did:jwk:delegate',
        expectedProviderDid : 'did:dht:bob',
      },
      [
        ...ownerPermissions('did:dht:alice', [grant({
          ownerDid  : 'did:dht:alice',
          sessionId : 'session-alice',
          createdAt : '2026-07-13T11:30:00.000Z',
        })]),
        ...ownerPermissions('did:dht:bob', [grant({
          ownerDid  : 'did:dht:bob',
          sessionId : 'session-bob',
          createdAt : '2026-07-13T10:00:00.000Z',
        })]),
      ],
      NOW,
    );

    expect(detection).toEqual(expect.objectContaining({
      matchState     : 'matched',
      pinnedOwnerDid : 'did:dht:bob',
    }));
    expect(detection.matchedSession?.bundles[0].id).toBe('session-bob');
  });

  it('blocks an ambiguous delegate that has sessions under multiple owners', () => {
    const detection = detectConnectRefresh(
      { requestType: 'refresh', delegateDid: 'did:jwk:delegate' },
      [
        ...ownerPermissions('did:dht:alice', [grant({ ownerDid: 'did:dht:alice' })]),
        ...ownerPermissions('did:dht:bob', [grant({ ownerDid: 'did:dht:bob', sessionId: 'session-bob' })]),
      ],
      NOW,
    );

    expect(detection.matchState).toBe('ambiguous');
    expect(detection.pinnedOwnerDid).toBeUndefined();
  });
});

describe('splitRefreshAccess', () => {
  const tasks = 'https://example.com/modules/tasks';
  const bills = 'https://example.com/modules/bills';
  const scope = (module: string, method: string, extra: Record<string, string> = {}) =>
    ({ interface: 'Records', method, module, ...extra });
  const request = (module: string, scopes: ReturnType<typeof scope>[]) =>
    ({ moduleDefinition: { module, types: {}, structure: {} }, permissionScopes: scopes }) as unknown as ConnectPermissionRequest;
  const held = (module: string, method: string, extra: Record<string, string> = {}) =>
    ({ ...grant(), scope: scope(module, method, extra) }) as DwnPermissionGrant;
  const methods = (requests: ConnectPermissionRequest[]) =>
    requests.map((item) => `${item.moduleDefinition.module.split('/').at(-1)}:${item.permissionScopes.map((s) => s.method).join('+')}`);

  it('treats everything the delegate held before as a renewal', () => {
    const split = splitRefreshAccess([request(tasks, [scope(tasks, 'Read')])], [held(tasks, 'Read')]);
    expect(split.added).toEqual([]);
    expect(methods(split.renewed)).toEqual(['tasks:Read']);
  });

  it('reports modules the delegate never had as new access, whatever the request claims', () => {
    const split = splitRefreshAccess(
      [request(tasks, [scope(tasks, 'Read')]), request(bills, [scope(bills, 'Read'), scope(bills, 'Write')])],
      [held(tasks, 'Read')],
    );
    expect(methods(split.added)).toEqual(['bills:Read+Write']);
    expect(methods(split.renewed)).toEqual(['tasks:Read']);
  });

  it('splits a module whose request widens what was granted', () => {
    const split = splitRefreshAccess(
      [request(tasks, [scope(tasks, 'Read'), scope(tasks, 'Delete')])],
      [held(tasks, 'Read')],
    );
    expect(methods(split.added)).toEqual(['tasks:Delete']);
    expect(methods(split.renewed)).toEqual(['tasks:Read']);
  });

  it('never lets a path- or context-limited grant cover broader access', () => {
    const split = splitRefreshAccess(
      [request(tasks, [scope(tasks, 'Read')]), request(bills, [scope(bills, 'Read', { contextId: 'ctx-2' })])],
      [held(tasks, 'Read', { modulePath: 'list' }), held(bills, 'Read', { contextId: 'ctx-1' })],
    );
    expect(methods(split.added)).toEqual(['tasks:Read', 'bills:Read']);
    expect(split.renewed).toEqual([]);
  });

  it('lets a module-wide grant cover a narrower request', () => {
    const split = splitRefreshAccess(
      [request(tasks, [scope(tasks, 'Read', { modulePath: 'list' })])],
      [held(tasks, 'Read')],
    );
    expect(split.added).toEqual([]);
  });

  it('keeps setup-only modules with the renewal, since they grant nothing', () => {
    const split = splitRefreshAccess([request(bills, [])], []);
    expect(split.added).toEqual([]);
    expect(split.renewed).toHaveLength(1);
  });
});

describe('refreshRequestSummary', () => {
  const request = (slug: string, scopes = 1) => ({
    moduleDefinition : { module: `https://example.com/modules/${slug}`, types: {}, structure: {} },
    permissionScopes : Array.from({ length: scopes }, () => ({ interface: 'Records', method: 'Read', module: `https://example.com/modules/${slug}` })),
  }) as unknown as ConnectPermissionRequest;

  it('says renew only when nothing is new', () => {
    expect(refreshRequestSummary({ added: [], renewed: [request('tasks')] })).toBe('wants to renew its access to your profile');
    expect(refreshRequestSummary(undefined)).toBe('wants to renew its access to your profile');
  });

  it('names what is being added, and mentions the renewal when there is one', () => {
    expect(refreshRequestSummary({ added: [request('bills'), request('budgets')], renewed: [] }))
      .toBe('wants to add Bills and Budgets');
    expect(refreshRequestSummary({ added: [request('bills')], renewed: [request('tasks')] }))
      .toBe('wants to add Bills and renew its existing access');
  });

  it('keeps long lists short', () => {
    const added = ['bills', 'budgets', 'receipts', 'payees'].map((slug) => request(slug));
    expect(refreshRequestSummary({ added, renewed: [] })).toBe('wants to add Bills, Budgets, and 2 more');
  });
});
