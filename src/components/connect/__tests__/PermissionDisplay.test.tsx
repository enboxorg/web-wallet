import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/agent';

import { PermissionDisplay } from '../PermissionDisplay';

const tasksProtocol = 'https://example.com/protocols/tasks';

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

    expect(screen.getByText('Connection summary')).toBeInTheDocument();
    expect(screen.getByText('24-hour session')).toBeInTheDocument();
    expect(screen.getByText('Access requested')).toBeInTheDocument();
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

    expect(screen.getByText('Adds 1 data format')).toBeInTheDocument();
    expect(screen.getByText('Wallet setup')).toBeInTheDocument();
    expect(screen.getByText('Will add data format')).toBeInTheDocument();
    expect(screen.getByText(/Adds Tasks so this app can use its data/i)).toBeInTheDocument();
    expect(screen.getByText('Technical details')).toBeInTheDocument();
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

    expect(screen.getByText('Updates 1 data format')).toBeInTheDocument();
    expect(screen.getByText('Will update data format')).toBeInTheDocument();
    expect(screen.getByText(/newer setup than this identity has today/i)).toBeInTheDocument();
    expect(screen.queryByText(/schema mismatch/i)).not.toBeInTheDocument();
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

    expect(screen.getByText('No new setup')).toBeInTheDocument();
    expect(screen.getByText(/already has 2 active sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/separate 24-hour session/i)).toBeInTheDocument();
    expect(screen.queryByText('Existing app access')).not.toBeInTheDocument();
  });
});
