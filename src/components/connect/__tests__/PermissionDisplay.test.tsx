import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/agent';

import { PermissionDisplay } from '../PermissionDisplay';

describe('PermissionDisplay', () => {
  it('shows user-facing record scopes and hides internal connect support scopes', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: 'https://example.com/protocols/demo',
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Protocols',
          method: 'Query',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Messages',
          method: 'Read',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Records',
          method: 'Write',
          protocol: 'https://example.com/protocols/demo',
        },
        {
          interface: 'Records',
          method: 'Delete',
          protocol: 'https://example.com/protocols/demo',
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.queryByText('Query')).not.toBeInTheDocument();
    expect(screen.queryByText('Protocols.Query')).not.toBeInTheDocument();
    expect(screen.queryByText('Messages.Read')).not.toBeInTheDocument();
  });

  it('shows wallet-owned protocol setup and an advanced protocol definition view', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: 'https://example.com/protocols/tasks',
        types: {
          task: {
            schema: 'https://example.com/schemas/task',
            dataFormats: ['application/json'],
            encryptionRequired: true,
          },
          comment: {
            schema: 'https://example.com/schemas/comment',
            dataFormats: ['text/plain'],
          },
        },
        structure: {
          task: {
            comment: {},
            $actions: [],
          },
        },
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://example.com/protocols/tasks',
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('Protocol setup')).toBeInTheDocument();
    expect(screen.getByText(/wallet will make sure this protocol is configured/i)).toBeInTheDocument();
    expect(screen.getByText('Advanced protocol view')).toBeInTheDocument();
    expect(screen.getByText('2 types')).toBeInTheDocument();
    expect(screen.getByText('2 paths')).toBeInTheDocument();
    expect(screen.getByText('task/comment')).toBeInTheDocument();
    expect(screen.getByText(/"protocol": "https:\/\/example\.com\/protocols\/tasks"/)).toBeInTheDocument();
    expect(screen.getByText(/"encryptionRequired": true/)).toBeInTheDocument();
  });
});
