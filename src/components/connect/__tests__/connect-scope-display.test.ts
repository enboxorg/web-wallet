import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';
import { ProfileDefinition } from '@enbox/modules';

import { createCanonicalContextCompanionDefinition } from '@/lib/module-names';
import {
  formatList,
  getSortedPermissionActions,
  groupPermissionRequestsWithCompanions,
  mergePermissionRequestsByModule,
} from '../connect-scope-display';

function permissionRequest(
  module: string,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): ConnectPermissionRequest {
  return {
    moduleDefinition: { module, types: {}, structure: {} },
    permissionScopes,
  } as ConnectPermissionRequest;
}

const read = (module: string) => ({ interface: 'Records', method: 'Read', module }) as ConnectPermissionRequest['permissionScopes'][number];
const write = (module: string) => ({ interface: 'Records', method: 'Write', module }) as ConnectPermissionRequest['permissionScopes'][number];

describe('getSortedPermissionActions', () => {
  it('orders record access before sync and setup scopes, de-duplicated', () => {
    const actions = getSortedPermissionActions([
      { interface: 'Modules', method: 'Query' },
      { interface: 'Records', method: 'Delete' },
      { interface: 'Messages', method: 'Read' },
      { interface: 'Records', method: 'Read' },
      { interface: 'Records', method: 'Read' },
      { interface: 'Records', method: 'Write' },
    ]);

    expect(actions.map((action) => action.label)).toEqual([
      'View', 'Add or edit', 'Delete', 'Sync changes', 'Inspect setup',
    ]);
    expect(actions.map((action) => action.risk)).toEqual(['view', 'edit', 'delete', 'view', 'view']);
    expect(actions.map((action) => action.scope)).toEqual([
      'Records.Read', 'Records.Write', 'Records.Delete', 'Messages.Read', 'Modules.Query',
    ]);
  });

  it('keeps unknown scopes explicit', () => {
    expect(getSortedPermissionActions([{ interface: 'Records', method: 'Query' }])[0])
      .toMatchObject({ label: 'Records.Query', kind: 'other', risk: 'other' });
  });
});

describe('mergePermissionRequestsByModule', () => {
  it('merges duplicate module entries into one request', () => {
    const uri = 'https://example.com/modules/notes';
    const merged = mergePermissionRequestsByModule([
      permissionRequest(uri, [read(uri)]),
      permissionRequest(uri, [write(uri)]),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].permissionScopes.map((scope) => scope.method)).toEqual(['Read', 'Write']);
  });
});

describe('groupPermissionRequestsWithCompanions', () => {
  it('pairs a verified /contexts companion with its domain module', () => {
    const notesUri = 'https://example.com/modules/notes';
    const contextsUri = `${notesUri}/contexts`;
    const groups = groupPermissionRequestsWithCompanions([
      permissionRequest(notesUri, [read(notesUri)]),
      { moduleDefinition: createCanonicalContextCompanionDefinition(contextsUri), permissionScopes: [read(contextsUri)] },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].permission.moduleDefinition.module).toBe(notesUri);
    expect(groups[0].companion?.moduleDefinition.module).toBe(contextsUri);
    expect(groups[0].isStandaloneCompanion).toBe(false);
  });

  it('pairs with canonical modules and flags a lone companion as standalone', () => {
    const contextsUri = `${ProfileDefinition.module}/contexts`;
    const companion = {
      moduleDefinition : createCanonicalContextCompanionDefinition(contextsUri),
      permissionScopes : [read(contextsUri)],
    };

    expect(groupPermissionRequestsWithCompanions([
      {
        moduleDefinition : ProfileDefinition as ConnectPermissionRequest['moduleDefinition'],
        permissionScopes : [read(ProfileDefinition.module)],
      },
      companion,
    ])).toHaveLength(1);

    const [standalone] = groupPermissionRequestsWithCompanions([companion]);
    expect(standalone.isStandaloneCompanion).toBe(true);
    expect(standalone.companion).toBeUndefined();
  });

  it('never pairs a spoofed /contexts definition', () => {
    const notesUri = 'https://example.com/modules/notes';
    const spoofedUri = `${notesUri}/contexts`;
    const groups = groupPermissionRequestsWithCompanions([
      permissionRequest(notesUri, [read(notesUri)]),
      permissionRequest(spoofedUri, [read(spoofedUri)]),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.companion === undefined && !group.isStandaloneCompanion)).toBe(true);
  });
});

describe('formatList', () => {
  it('joins with an Oxford comma', () => {
    expect(formatList([])).toBe('');
    expect(formatList(['view'])).toBe('view');
    expect(formatList(['view', 'edit'])).toBe('view and edit');
    expect(formatList(['view', 'edit', 'delete'])).toBe('view, edit, and delete');
  });
});
