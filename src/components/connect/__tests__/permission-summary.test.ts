import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/agent';

import { getConnectPermissionAskSummary } from '../permission-summary';

function permissionRequest(
  protocol: string,
  permissionScopes: ConnectPermissionRequest['permissionScopes'],
): ConnectPermissionRequest {
  return {
    protocolDefinition: {
      protocol,
      types: {},
      structure: {},
    },
    permissionScopes,
  } as ConnectPermissionRequest;
}

describe('getConnectPermissionAskSummary', () => {
  it('hides internal connect-support scopes from the user-facing ask', () => {
    const permissions = [
      permissionRequest('https://example.com/protocols/tasks', [
        {
          interface: 'Protocols',
          method: 'Query',
          protocol: 'https://example.com/protocols/tasks',
        },
        {
          interface: 'Messages',
          method: 'Read',
          protocol: 'https://example.com/protocols/tasks',
        },
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/tasks',
        },
      ]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants to view a custom data type.');
  });

  it('collapses repeated unknown protocol placeholders in longer summaries', () => {
    const permissions = [
      permissionRequest('https://example.com/protocols/tasks', [
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/tasks',
        },
      ]),
      permissionRequest('https://example.com/protocols/notes', [
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/notes',
        },
      ]),
      permissionRequest('https://identity.foundation/protocols/profile', [
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://identity.foundation/protocols/profile',
        },
      ]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants access to 2 custom data types and 1 more.');
  });

  it('merges duplicate protocol entries before writing the headline ask', () => {
    const permissions = [
      permissionRequest('https://example.com/protocols/tasks', [
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/tasks',
        },
      ]),
      permissionRequest('https://example.com/protocols/tasks', [
        {
          interface: 'Records',
          method: 'Write',
          protocol: 'https://example.com/protocols/tasks',
        },
      ]),
    ];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants to view and add or edit a custom data type.');
  });
});
