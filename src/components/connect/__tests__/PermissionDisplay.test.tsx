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
});
