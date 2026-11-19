import type { DwnPermissionGrant } from '@enbox/agent';
import { describe, expect, it } from 'vitest';

import { groupGrantAccess, isGrantActive } from '../permission-access';

const NOTES = 'https://enbox.id/modules/notes/v1';
const NOTES_CONTEXTS = 'https://enbox.id/modules/notes/v1/contexts';
const PROFILE = 'https://identity.foundation/modules/profile';

let counter = 0;
function grant(
  scope: Record<string, string>,
  dateExpires = '2099-01-01T00:00:00.000Z',
): DwnPermissionGrant {
  counter += 1;
  return {
    id      : `grant-${counter}`,
    grantee : 'did:jwk:delegate',
    dateExpires,
    scope,
  } as unknown as DwnPermissionGrant;
}

describe('groupGrantAccess', () => {
  it('collapses one grant per scope into a single row per module', () => {
    const rows = groupGrantAccess([
      grant({ interface: 'Modules', method: 'Query', module: NOTES }),
      grant({ interface: 'Messages', method: 'Read', module: NOTES }),
      grant({ interface: 'Records', method: 'Delete', module: NOTES }),
      grant({ interface: 'Records', method: 'Read', module: NOTES }),
      grant({ interface: 'Records', method: 'Write', module: NOTES }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].module).toBe(NOTES);
    expect(rows[0].grants).toHaveLength(5);
    // Record access first (view → edit → delete), then sync and setup.
    expect(rows[0].actions.map((action) => action.label)).toEqual([
      'View',
      'Add or edit',
      'Delete',
      'Sync changes',
      'Inspect setup',
    ]);
    expect(rows[0].actions.map((action) => action.kind)).toEqual([
      'record', 'record', 'record', 'support', 'support',
    ]);
  });

  it('de-duplicates repeated scopes across renewals', () => {
    const rows = groupGrantAccess([
      grant({ interface: 'Records', method: 'Read', module: PROFILE }),
      grant({ interface: 'Records', method: 'Read', module: PROFILE }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].grants).toHaveLength(2);
    expect(rows[0].actions.map((action) => action.label)).toEqual(['View']);
  });

  it('keeps path- and context-scoped access as separate rows', () => {
    const rows = groupGrantAccess([
      grant({ interface: 'Records', method: 'Read', module: NOTES }),
      grant({ interface: 'Records', method: 'Read', module: NOTES, modulePath: 'notebook/note' }),
      grant({ interface: 'Records', method: 'Write', module: NOTES, contextId: 'ctx-1' }),
    ]);

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => [row.modulePath, row.contextId])).toEqual([
      [undefined, undefined],
      ['notebook/note', undefined],
      [undefined, 'ctx-1'],
    ]);
  });

  it('orders rows by module name with companions after their root', () => {
    const rows = groupGrantAccess([
      grant({ interface: 'Records', method: 'Read', module: PROFILE }),
      grant({ interface: 'Records', method: 'Read', module: NOTES_CONTEXTS }),
      grant({ interface: 'Records', method: 'Read', module: NOTES }),
    ]);

    expect(rows.map((row) => row.module)).toEqual([NOTES, NOTES_CONTEXTS, PROFILE]);
  });

  it('keeps unrecognised scopes verbatim', () => {
    const rows = groupGrantAccess([
      grant({ interface: 'Modules', method: 'Configure', module: NOTES }),
    ]);

    expect(rows[0].actions[0]).toMatchObject({ label: 'Modules.Configure', kind: 'other' });
  });
});

describe('isGrantActive', () => {
  it('treats past and unparseable expiries as inactive', () => {
    const now = Date.parse('2026-01-01T00:00:00.000Z');
    expect(isGrantActive(grant({}, '2026-01-02T00:00:00.000Z'), now)).toBe(true);
    expect(isGrantActive(grant({}, '2025-12-31T00:00:00.000Z'), now)).toBe(false);
    expect(isGrantActive(grant({}, 'not a date'), now)).toBe(false);
  });
});
