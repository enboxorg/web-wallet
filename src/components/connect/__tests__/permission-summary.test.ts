import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';
import { ProfileDefinition } from '@enbox/modules';

import { createCanonicalContextCompanionDefinition } from '@/lib/module-names';
import { getConnectPermissionAskSummary } from '../permission-summary';

function permissionRequest(
  module: string,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): ConnectPermissionRequest {
  return {
    moduleDefinition: {
      module,
      types: {},
      structure: {},
    },
    permissionScopes,
  } as ConnectPermissionRequest;
}

describe('getConnectPermissionAskSummary', () => {
  it('does not describe installation-only dependencies as app access', () => {
    const dependencies = [permissionRequest('https://example.com/modules/shared-roles', [])];
    expect(getConnectPermissionAskSummary(dependencies)).toBe('wants to connect.');
    expect(getConnectPermissionAskSummary([
      ...dependencies,
      permissionRequest('https://example.com/modules/comments', [{ interface: 'Records', method: 'Read', module: 'https://example.com/modules/comments' }]),
    ])).toBe('wants to view a custom data type.');
  });

  it('hides internal connect-support scopes from the user-facing ask', () => {
    const permissions = [
      permissionRequest('https://example.com/modules/tasks', [
        {
          interface: 'Modules',
          method: 'Query',
          module: 'https://example.com/modules/tasks',
        },
        {
          interface: 'Messages',
          method: 'Read',
          module: 'https://example.com/modules/tasks',
        },
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://example.com/modules/tasks',
        },
      ]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants to view a custom data type.');
  });

  it('describes an internal scope when it is the only granted capability', () => {
    const permissions = [
      permissionRequest('https://example.com/modules/tasks', [{
        interface: 'Messages',
        method: 'Read',
        module: 'https://example.com/modules/tasks',
      }]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe(
      'wants to view messages from a custom data type.',
    );
  });

  it('collapses repeated unknown module placeholders in longer summaries', () => {
    const permissions = [
      permissionRequest('https://example.com/modules/tasks', [
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://example.com/modules/tasks',
        },
      ]),
      permissionRequest('https://example.com/modules/notes', [
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://example.com/modules/notes',
        },
      ]),
      permissionRequest('https://identity.foundation/modules/profile', [
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://identity.foundation/modules/profile',
        },
      ]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants access to 2 custom data types and 1 more.');
  });

  it('does not trust an unverified or custom module definition with a friendly display name', () => {
    expect(getConnectPermissionAskSummary([permissionRequest('https://example.com/modules/notes', [{
      interface : 'Records',
      method    : 'Read',
      module    : 'https://example.com/modules/notes',
    }])])).toBe('wants to view a custom data type.');

    expect(getConnectPermissionAskSummary([permissionRequest(ProfileDefinition.module, [{
      interface : 'Records',
      method    : 'Read',
      module    : ProfileDefinition.module,
    }])])).toBe('wants to view a custom data type.');
  });

  it('merges duplicate module entries before writing the headline ask', () => {
    const permissions = [
      permissionRequest('https://example.com/modules/tasks', [
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://example.com/modules/tasks',
        },
      ]),
      permissionRequest('https://example.com/modules/tasks', [
        {
          interface: 'Records',
          method: 'Write',
          module: 'https://example.com/modules/tasks',
        },
      ]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants to view and add or edit a custom data type.');
  });

  it('pairs a verified /contexts companion with its domain module cohesively', () => {
    const notesUri = 'https://example.com/modules/notes';
    const notesContextsUri = `${notesUri}/contexts`;

    expect(getConnectPermissionAskSummary([
      permissionRequest(notesUri, [
        { interface: 'Records', method: 'Read', module: notesUri },
        { interface: 'Records', method: 'Write', module: notesUri },
      ]),
      {
        moduleDefinition : createCanonicalContextCompanionDefinition(notesContextsUri),
        permissionScopes : [
          { interface: 'Records', method: 'Read', module: notesContextsUri },
          { interface: 'Records', method: 'Write', module: notesContextsUri },
        ],
      },
    ])).toBe('wants to view and add or edit a custom data type and its shared contexts.');

    expect(getConnectPermissionAskSummary([
      permissionRequest(notesUri, [
        { interface: 'Records', method: 'Read', module: notesUri },
      ]),
      {
        moduleDefinition : createCanonicalContextCompanionDefinition(notesContextsUri),
        permissionScopes : [
          { interface: 'Records', method: 'Read', module: notesContextsUri },
          { interface: 'Records', method: 'Write', module: notesContextsUri },
        ],
      },
    ])).toBe('wants to view a custom data type and view and add or edit its shared contexts.');
  });

  it('pairs a verified companion with a canonical module and handles standalone or 3+ group asks', () => {
    const profileContextsUri = `${ProfileDefinition.module}/contexts`;
    const pairedProfile: ConnectPermissionRequest[] = [
      {
        moduleDefinition : ProfileDefinition as ConnectPermissionRequest['moduleDefinition'],
        permissionScopes : [
          { interface: 'Records', method: 'Read', module: ProfileDefinition.module },
        ],
      },
      {
        moduleDefinition : createCanonicalContextCompanionDefinition(profileContextsUri),
        permissionScopes : [
          { interface: 'Records', method: 'Read', module: profileContextsUri },
        ],
      },
    ];

    expect(getConnectPermissionAskSummary(pairedProfile)).toBe(
      'wants to view your Profile and its shared contexts.',
    );

    expect(getConnectPermissionAskSummary([
      pairedProfile[1],
    ])).toBe('wants to view shared context invitations and followed contexts.');

    expect(getConnectPermissionAskSummary([
      ...pairedProfile,
      permissionRequest('https://example.com/modules/tasks', [
        { interface: 'Records', method: 'Read', module: 'https://example.com/modules/tasks' },
      ]),
      permissionRequest('https://example.com/modules/notes', [
        { interface: 'Records', method: 'Read', module: 'https://example.com/modules/notes' },
      ]),
    ])).toBe('wants access to Profile (with shared contexts), a custom data type, and 1 more.');
  });

  it('never pairs or promotes a spoofed /contexts definition', () => {
    const notesUri = 'https://example.com/modules/notes';
    const spoofedContextsUri = `${notesUri}/contexts`;

    expect(getConnectPermissionAskSummary([
      permissionRequest(notesUri, [
        { interface: 'Records', method: 'Read', module: notesUri },
      ]),
      permissionRequest(spoofedContextsUri, [
        { interface: 'Records', method: 'Read', module: spoofedContextsUri },
      ]),
    ])).toBe('wants to view a custom data type and view a custom data type.');
  });
});
