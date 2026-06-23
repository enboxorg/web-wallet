import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/agent';

import { PermissionDisplay } from '../PermissionDisplay';

const tasksProtocol = 'https://example.com/protocols/tasks';
const notesProtocol = 'https://example.com/protocols/notes';
const profileProtocol = 'https://identity.foundation/protocols/profile';
const socialGraphProtocol = 'https://identity.foundation/protocols/social-graph';

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

    expect(screen.getByText(/will be able to do/i)).toBeInTheDocument();
    expect(screen.getByText('Access lasts 24 hours')).toBeInTheDocument();
    expect(screen.getByText('View, add or edit, and delete a custom data type')).toBeInTheDocument();
    expect(screen.getByText(/Custom protocol:\s*example\.com\/protocols\/demo/i)).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Add or edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.queryByText('Query')).not.toBeInTheDocument();
    expect(screen.queryByText('Protocols.Query')).not.toBeInTheDocument();
    expect(screen.queryByText('Messages.Read')).not.toBeInTheDocument();
    expect(screen.getByTestId('technical-setup-details')).not.toHaveAttribute('open');
  });

  it('does not promote unknown protocol slugs into trusted data names', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: 'https://evil.example/protocols/verified-account',
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          protocol: 'https://evil.example/protocols/verified-account',
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('View a custom data type')).toBeInTheDocument();
    expect(screen.getByText(/Custom protocol:\s*evil\.example\/protocols\/verified-account/i)).toBeInTheDocument();
    expect(screen.getAllByText('Custom protocol').length).toBeGreaterThan(0);
    expect(screen.queryByText('Protocol at https://evil.example/protocols/verified-account')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified Account')).not.toBeInTheDocument();
    expect(screen.queryByText('View your Verified Account')).not.toBeInTheDocument();
    expect(screen.queryByText('View')).not.toBeInTheDocument();
  });

  it('shows a single encrypted-data explanation for multiple encrypted rows', () => {
    const permissions = [
      {
        protocolDefinition: {
          protocol: 'https://example.com/protocols/private-notes',
          types: {
            note: {
              encryptionRequired: true,
            },
          },
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: 'https://example.com/protocols/private-notes',
          },
        ],
      },
      {
        protocolDefinition: {
          protocol: 'https://example.com/protocols/private-tasks',
          types: {
            task: {
              encryptionRequired: true,
            },
          },
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: 'https://example.com/protocols/private-tasks',
          },
        ],
      },
    ] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getAllByText(/Approval shares the keys needed/i)).toHaveLength(1);
    expect(screen.getByText(/Some allowed data is stored encrypted/i)).toBeInTheDocument();
  });

  it('merges duplicate permission entries for the same protocol into one access row', () => {
    const permissions = [
      {
        protocolDefinition: {
          protocol: tasksProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: tasksProtocol,
          },
        ],
      },
      {
        protocolDefinition: {
          protocol: tasksProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Write',
            protocol: tasksProtocol,
          },
        ],
      },
    ] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('View and add or edit a custom data type')).toBeInTheDocument();
    expect(screen.queryByText('View a custom data type')).not.toBeInTheDocument();
    expect(screen.queryByText('Add or edit a custom data type')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Custom protocol:\s*example\.com\/protocols\/tasks/i)).toHaveLength(1);
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Add or edit')).toBeInTheDocument();
  });

  it('shows wallet-owned protocol setup and an advanced protocol definition view', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: tasksProtocol,
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
          protocol: tasksProtocol,
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={{ [tasksProtocol]: 'install' }}
      />,
    );

    expect(screen.getByText('Wallet setup')).toBeInTheDocument();
    expect(screen.getByText('Will add setup')).toBeInTheDocument();
    expect(screen.getByText('Will add')).toBeInTheDocument();
    expect(screen.getByText(/does not add permissions beyond the access listed above/i)).toBeInTheDocument();
    expect(screen.getByText('Technical & setup details')).toBeInTheDocument();
    expect(screen.getByText(/Stored encrypted. Approval shares the keys/i)).toBeInTheDocument();
    expect(screen.getByText('2 types')).toBeInTheDocument();
    expect(screen.getByText('2 paths')).toBeInTheDocument();
    expect(screen.getByText('task/comment')).toBeInTheDocument();
    expect(screen.getByText(/"protocol": "https:\/\/example\.com\/protocols\/tasks"/)).toBeInTheDocument();
    expect(screen.getByText(/"encryptionRequired": true/)).toBeInTheDocument();
  });

  it('calls out older or different protocol setup without technical jargon', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: tasksProtocol,
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          protocol: tasksProtocol,
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={{ [tasksProtocol]: 'update' }}
      />,
    );

    expect(screen.getByText('Will update setup')).toBeInTheDocument();
    expect(screen.getByText('Will update')).toBeInTheDocument();
    expect(screen.queryByText(/schema mismatch/i)).not.toBeInTheDocument();
  });

  it('groups setup work separately from data areas that are already ready', () => {
    const permissions = [
      {
        protocolDefinition: {
          protocol: profileProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: profileProtocol,
          },
        ],
      },
      {
        protocolDefinition: {
          protocol: socialGraphProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: socialGraphProtocol,
          },
        ],
      },
      {
        protocolDefinition: {
          protocol: tasksProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: tasksProtocol,
          },
        ],
      },
      {
        protocolDefinition: {
          protocol: notesProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: notesProtocol,
          },
        ],
      },
    ] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={{
          [profileProtocol]     : 'configured',
          [socialGraphProtocol] : 'configured',
          [tasksProtocol]       : 'install',
          [notesProtocol]       : 'update',
        }}
      />,
    );

    expect(screen.getByText('Will add or update setup')).toBeInTheDocument();
    expect(screen.getAllByText('Already ready').length).toBeGreaterThan(0);
    expect(screen.getByText(/The wallet will not change these/i)).toBeInTheDocument();
    expect(screen.getByText('Will add')).toBeInTheDocument();
    expect(screen.getByText('Will update')).toBeInTheDocument();
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Social Graph').length).toBeGreaterThan(0);
  });

  it('summarizes existing app access without repeating a separate notice', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: tasksProtocol,
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          protocol: tasksProtocol,
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={{ [tasksProtocol]: 'configured' }}
        existingSessionCount={2}
      />,
    );

    expect(screen.getByText('Access lasts 24 hours')).toBeInTheDocument();
    expect(screen.getByText(/already has 2 active sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/separate 24-hour session/i)).toBeInTheDocument();
    expect(screen.queryByText('Existing app access')).not.toBeInTheDocument();
  });
});
