import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';

import { PermissionDisplay } from '../PermissionDisplay';

const tasksProtocol = 'https://example.com/protocols/tasks';
const notesProtocol = 'https://example.com/protocols/notes';
const profileProtocol = 'https://identity.foundation/protocols/profile';
const connectProtocol = 'https://identity.foundation/protocols/connect';

describe('PermissionDisplay', () => {
  it('keeps support scopes out of the summary while disclosing every granted scope', () => {
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
    expect(screen.getByText('Additional grants: Protocols.Query, Messages.Read.')).toBeInTheDocument();
    expect(screen.getAllByText('Protocols.Query')).toHaveLength(1);
    expect(screen.getAllByText('Messages.Read')).toHaveLength(1);
    expect(screen.getByTestId('technical-setup-details')).not.toHaveAttribute('open');
  });

  it('shows the effective capability when a request contains only a support scope', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: 'https://example.com/protocols/demo',
        types: {},
        structure: {},
      },
      permissionScopes: [{
        interface: 'Messages',
        method: 'Read',
        protocol: 'https://example.com/protocols/demo',
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('View messages from a custom data type')).toBeInTheDocument();
    expect(screen.getByText('Messages.Read')).toBeInTheDocument();
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

    expect(screen.getAllByText(/Approval permanently shares decryption keys/i)).toHaveLength(1);
    expect(screen.getByText(/matching ciphertext obtained now or later can still be decrypted/i)).toBeInTheDocument();
  });

  it('does not claim that write-only encrypted access receives private keys', () => {
    const permissions = [{
      protocolDefinition: {
        protocol: 'https://example.com/protocols/private-tasks',
        types: {
          task: { encryptionRequired: true },
        },
        structure: {},
      },
      permissionScopes: [{
        interface: 'Records',
        method: 'Write',
        protocol: 'https://example.com/protocols/private-tasks',
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText(/does not share private decryption keys/i)).toBeInTheDocument();
    expect(screen.queryByText(/Approval permanently shares decryption keys/i)).not.toBeInTheDocument();
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
    expect(screen.getByText(/Protocol setup controls record authorization/i)).toBeInTheDocument();
    expect(screen.getByText('Technical & setup details')).toBeInTheDocument();
    expect(screen.getByText(/Approval permanently shares decryption keys/i)).toBeInTheDocument();
    expect(screen.getByText('2 types')).toBeInTheDocument();
    expect(screen.getByText('2 paths')).toBeInTheDocument();
    expect(screen.getByText('task/comment')).toBeInTheDocument();
    expect(screen.getByText(/"protocol": "https:\/\/example\.com\/protocols\/tasks"/)).toBeInTheDocument();
    expect(screen.getByText(/"encryptionRequired": true/)).toBeInTheDocument();
  });

  it('blocks a conflicting installed protocol setup', () => {
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
        protocolSetupStatuses={{ [tasksProtocol]: 'conflict' }}
      />,
    );

    expect(screen.getByText('Protocol setup conflict')).toBeInTheDocument();
    expect(screen.getByText(/will not replace a core protocol during a connection/i)).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('offers an override opt-in for a custom definition conflict', () => {
    const onOverrideAcknowledgedChange = vi.fn();
    const permissions = [{
      protocolDefinition: {
        protocol: notesProtocol,
        types: {},
        structure: {},
      },
      permissionScopes: [{
        interface: 'Records',
        method: 'Write',
        protocol: notesProtocol,
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={{ [notesProtocol]: 'override' }}
        overrideAcknowledged={false}
        onOverrideAcknowledgedChange={onOverrideAcknowledgedChange}
      />,
    );

    // An override is NOT the hard-conflict notice.
    expect(screen.queryByText('Protocol setup conflict')).not.toBeInTheDocument();
    expect(screen.getByText(/replace my installed protocol/i)).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(onOverrideAcknowledgedChange).toHaveBeenCalledWith(true);
  });

  it('surfaces an unavailable setup check and retries it', () => {
    const retry = vi.fn();
    const permissions = [{
      protocolDefinition: {
        protocol: tasksProtocol,
        types: {},
        structure: {},
      },
      permissionScopes: [{
        interface: 'Records',
        method: 'Read',
        protocol: tasksProtocol,
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        protocolSetupStatuses={{ [tasksProtocol]: 'unavailable' }}
        onRetryProtocolSetup={retry}
      />,
    );

    expect(screen.getByText('Protocol setup could not be verified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry check' }));
    expect(retry).toHaveBeenCalledOnce();
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
          protocol: connectProtocol,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            protocol: connectProtocol,
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
          [connectProtocol]     : 'configured',
          [tasksProtocol]       : 'install',
          [notesProtocol]       : 'upgrade',
        }}
      />,
    );

    expect(screen.getByText('Will add setup')).toBeInTheDocument();
    expect(screen.getByText('Will upgrade encryption')).toBeInTheDocument();
    expect(screen.getAllByText('Already ready').length).toBeGreaterThan(0);
    expect(screen.getByText(/The wallet will not change these/i)).toBeInTheDocument();
    expect(screen.getByText('Will add')).toBeInTheDocument();
    expect(screen.getByText('Encryption upgrade')).toBeInTheDocument();
    expect(screen.getAllByText(/identity\.foundation\/protocols\/profile/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/identity\.foundation\/protocols\/connect/i).length).toBeGreaterThan(0);
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
    expect(screen.getByText(/separate session with 24 hours of access/i)).toBeInTheDocument();
    expect(screen.queryByText('Existing app access')).not.toBeInTheDocument();
  });
});
