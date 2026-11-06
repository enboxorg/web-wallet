import { assertConnectPermissionRequests } from '@enbox/connect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DwnPermissionGrant } from '@enbox/agent';

import type { PermissionSessionGroup } from '../permission-sessions';

const mocks = vi.hoisted(() => ({
  executeConnectApproval: vi.fn(),
  fetchModules: vi.fn(),
}));

vi.mock('@enbox/agent', async (importOriginal) => ({
  ...await importOriginal<typeof import('@enbox/agent')>(),
  executeConnectApproval: mocks.executeConnectApproval,
}));

vi.mock('@/enbox/queries/identity-queries', () => ({
  fetchModules: mocks.fetchModules,
}));

import { renewExpiredSession } from '../renew-session';

const agent = { id: 'agent-1' } as never;

function grant(id: string, module: string, method: string): DwnPermissionGrant {
  return {
    id,
    grantee     : 'did:jwk:delegate',
    dateGranted : '2026-06-20T00:00:00.000Z',
    dateExpires : '2026-06-21T00:00:00.000Z',
    scope       : { interface: 'Records', method, module },
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
    mocks.fetchModules.mockResolvedValue([
      { uri: 'https://example.com/modules/tasks', published: true, definition: {
        module: 'https://example.com/modules/tasks', published: true,
        types: { task: { dataFormats: ['application/json'] } }, structure: { task: {} },
      } },
      { uri: 'https://example.com/modules/notes', published: true, definition: {
        module: 'https://example.com/modules/notes', published: true,
        types: { note: { dataFormats: ['application/json'] } }, structure: { note: {} },
      } },
    ]);
    mocks.executeConnectApproval.mockResolvedValue({});
  });

  it('re-runs the approval ceremony for the same delegate with deduped scopes grouped by module', async () => {
    const grants = [
      grant('grant-1', 'https://example.com/modules/tasks', 'Read'),
      grant('grant-2', 'https://example.com/modules/tasks', 'Write'),
      grant('grant-3', 'https://example.com/modules/notes', 'Read'),
      grant('grant-4', 'https://example.com/modules/tasks', 'Read'),
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
    assertConnectPermissionRequests(params.request.permissionRequests);
    expect(params.request.permissionRequests).toHaveLength(2);
    const tasksRequest = params.request.permissionRequests.find(
      (request: any) => request.moduleDefinition.module === 'https://example.com/modules/tasks',
    );
    expect(tasksRequest.permissionScopes).toHaveLength(2);
  });

  it('preserves module paths, context restrictions, and metadata scopes instead of widening them during renewal', async () => {
    const module = 'https://example.com/modules/tasks';
    const scopes = [
      { interface: 'Records', method: 'Read', module, modulePath: 'task' },
      { interface: 'Records', method: 'Read', module, modulePath: 'task/detail' },
      { interface: 'Records', method: 'Read', module, contextId: 'project-context' },
      { interface: 'Modules', method: 'Query', module },
    ];
    const grants = [...scopes, scopes[0]].map((scope, index) => ({
      ...grant(`grant-${index}`, module, 'Read'), scope,
    } as DwnPermissionGrant));

    await renewExpiredSession(agent, 'did:dht:owner', sessionGroup(grants));

    const params = mocks.executeConnectApproval.mock.calls[0][0];
    assertConnectPermissionRequests(params.request.permissionRequests);
    expect(params.request.permissionRequests).toEqual([{
      moduleDefinition: expect.objectContaining({ module }),
      permissionScopes: scopes,
    }]);
  });

  it('fails visibly when a used module is no longer installed', async () => {
    mocks.fetchModules.mockResolvedValue([]);

    await expect(
      renewExpiredSession(agent, 'did:dht:owner', sessionGroup([
        grant('grant-1', 'https://example.com/modules/tasks', 'Read'),
      ])),
    ).rejects.toThrow(/no longer installed/i);

    expect(mocks.executeConnectApproval).not.toHaveBeenCalled();
  });
});
