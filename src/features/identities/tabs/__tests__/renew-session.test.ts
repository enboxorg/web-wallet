import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DwnPermissionGrant } from '@enbox/agent';

import type { PermissionSessionGroup } from '../permission-sessions';

const mocks = vi.hoisted(() => ({
  executeConnectApproval: vi.fn(),
  fetchProtocols: vi.fn(),
}));

vi.mock('@enbox/agent', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/agent')>(),
  executeConnectApproval: mocks.executeConnectApproval,
}));

vi.mock('@/enbox/queries/identity-queries', () => ({
  fetchProtocols: mocks.fetchProtocols,
}));

import { renewExpiredSession } from '../renew-session';

const agent = { id: 'agent-1' } as never;

function grant(id: string, protocol: string, method: string): DwnPermissionGrant {
  return {
    id,
    grantee     : 'did:jwk:delegate',
    dateGranted : '2026-06-20T00:00:00.000Z',
    dateExpires : '2026-06-21T00:00:00.000Z',
    scope       : { interface: 'Records', method, protocol },
  } as DwnPermissionGrant;
}

function sessionGroup(grants: DwnPermissionGrant[]): PermissionSessionGroup {
  return {
    id      : 'did:jwk:delegate',
    grantee : 'did:jwk:delegate',
    session : {
      id        : 'session-1',
      createdAt : '2026-06-20T00:00:00.000Z',
      expiresAt : '2026-06-21T00:00:00.000Z',
      appName   : 'Example App',
      origin    : 'https://app.example',
      transport : 'postMessage' as const,
    },
    bundles     : [],
    grants,
    dateExpires : '2026-06-21T00:00:00.000Z',
    active      : false,
  };
}

describe('renewExpiredSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchProtocols.mockResolvedValue([
      { uri: 'https://example.com/protocols/tasks', published: true, definition: { protocol: 'https://example.com/protocols/tasks' } },
      { uri: 'https://example.com/protocols/notes', published: true, definition: { protocol: 'https://example.com/protocols/notes' } },
    ]);
    mocks.executeConnectApproval.mockResolvedValue({});
  });

  it('re-runs the approval ceremony for the same delegate with deduped scopes grouped by protocol', async () => {
    const grants = [
      grant('grant-1', 'https://example.com/protocols/tasks', 'Read'),
      grant('grant-2', 'https://example.com/protocols/tasks', 'Write'),
      grant('grant-3', 'https://example.com/protocols/notes', 'Read'),
      grant('grant-4', 'https://example.com/protocols/tasks', 'Read'),
    ];

    await renewExpiredSession(agent, 'did:dht:owner', sessionGroup(grants));

    expect(mocks.executeConnectApproval).toHaveBeenCalledTimes(1);
    const params = mocks.executeConnectApproval.mock.calls[0][0];
    expect(params.providerDid).toBe('did:dht:owner');
    expect(params.transport).toBe('postMessage');
    expect(params.request.delegateDid).toBe('did:jwk:delegate');
    expect(params.request.appName).toBe('Example App');
    expect(params.request.clientMetadata).toEqual(expect.objectContaining({
      origin: 'https://app.example',
    }));
    expect(params.request.permissionRequests).toHaveLength(2);
    const tasksRequest = params.request.permissionRequests.find(
      (request: any) => request.protocolDefinition.protocol === 'https://example.com/protocols/tasks',
    );
    expect(tasksRequest.permissionScopes).toHaveLength(2);
  });

  it('fails visibly when a used protocol is no longer installed', async () => {
    mocks.fetchProtocols.mockResolvedValue([]);

    await expect(
      renewExpiredSession(agent, 'did:dht:owner', sessionGroup([
        grant('grant-1', 'https://example.com/protocols/tasks', 'Read'),
      ])),
    ).rejects.toThrow(/no longer installed/i);

    expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
  });
});
