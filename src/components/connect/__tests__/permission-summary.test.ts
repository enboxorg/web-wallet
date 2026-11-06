import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';

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

  it('does not trust a known display name without a pinned definition', () => {
    const permissions = [permissionRequest('https://enbox.id/protocols/cashu-wallet', [{
      interface : 'Records',
      method    : 'Read',
      module  : 'https://enbox.id/protocols/cashu-wallet',
    }])];

    expect(getConnectPermissionAskSummary(permissions)).toBe('wants to view a custom data type.');
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
});
