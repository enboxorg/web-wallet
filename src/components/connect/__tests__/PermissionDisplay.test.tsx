import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';

import { createCanonicalContextCompanionDefinition } from '@/lib/module-names';
import { PermissionDisplay } from '../PermissionDisplay';

const tasksModule = 'https://example.com/modules/tasks';
const notesModule = 'https://example.com/modules/notes';
const profileModule = 'https://identity.foundation/modules/profile';
const connectModule = 'https://identity.foundation/modules/connect';

describe('PermissionDisplay', () => {
  it('keeps installation-only providers in setup details without presenting data permissions', () => {
    const provider = 'https://example.com/modules/shared-roles';
    const permissions: ConnectPermissionRequest[] = [{
      moduleDefinition: { module: provider, published: false, types: { member: {} }, structure: { member: { $role: true } } },
      permissionScopes: [],
    }, {
      moduleDefinition: { module: tasksModule, published: false, uses: { shared: provider }, types: { task: {} }, structure: { task: {} } },
      permissionScopes: [{ interface: 'Records', method: 'Read', module: tasksModule }],
    }];
    render(<PermissionDisplay permissions={permissions} />);
    expect(screen.getAllByText('View a custom data type')).toHaveLength(1);
    expect(screen.queryByText('Use a custom data type')).not.toBeInTheDocument();
    expect(screen.getByText(/Dependencies listed only for setup do not grant the app access/)).toBeInTheDocument();
    expect(screen.getAllByText(provider).length).toBeGreaterThan(0);
  });

  it('labels setup-only requests and excludes referenced roots from local record paths', () => {
    const permissions: ConnectPermissionRequest[] = [{
      moduleDefinition: {
        module: tasksModule, published: false, uses: { shared: notesModule },
        types: { task: {} }, structure: { workspace: { $ref: 'shared:workspace', task: {} } },
      },
      permissionScopes: [],
    }];
    render(<PermissionDisplay permissions={permissions} />);
    expect(screen.getByText('No record or message access is requested.')).toBeInTheDocument();
    expect(screen.getByText('None. This module is included only for setup.')).toBeInTheDocument();
    expect(screen.getByText('1 path')).toBeInTheDocument();
    expect(screen.getByText('workspace/task')).toBeInTheDocument();
    expect(screen.queryByText('workspace')).not.toBeInTheDocument();
  });

  it('keeps support scopes out of the summary while disclosing every granted scope', () => {
    const permissions = [{
      moduleDefinition: {
        module: 'https://example.com/modules/demo',
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Modules',
          method: 'Query',
          module: 'https://example.com/modules/demo',
        },
        {
          interface: 'Messages',
          method: 'Read',
          module: 'https://example.com/modules/demo',
        },
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://example.com/modules/demo',
        },
        {
          interface: 'Records',
          method: 'Write',
          module: 'https://example.com/modules/demo',
        },
        {
          interface: 'Records',
          method: 'Delete',
          module: 'https://example.com/modules/demo',
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText(/will be able to do/i)).toBeInTheDocument();
    expect(screen.getByText('Access lasts 1 hour')).toBeInTheDocument();
    expect(screen.getByText('View, add or edit, and delete a custom data type')).toBeInTheDocument();
    expect(screen.getByText(/Custom module:\s*example\.com\/modules\/demo/i)).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Add or edit')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.queryByText('Query')).not.toBeInTheDocument();
    expect(screen.getByText('Additional grants: Modules.Query, Messages.Read.')).toBeInTheDocument();
    expect(screen.getAllByText('Modules.Query')).toHaveLength(1);
    expect(screen.getAllByText('Messages.Read')).toHaveLength(1);
    expect(screen.getByTestId('technical-setup-details')).not.toHaveAttribute('open');
  });

  it('shows the effective capability when a request contains only a support scope', () => {
    const permissions = [{
      moduleDefinition: {
        module: 'https://example.com/modules/demo',
        types: {},
        structure: {},
      },
      permissionScopes: [{
        interface: 'Messages',
        method: 'Read',
        module: 'https://example.com/modules/demo',
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('View messages from a custom data type')).toBeInTheDocument();
    expect(screen.getByText('Messages.Read')).toBeInTheDocument();
  });

  it('does not promote unknown module slugs into trusted data names', () => {
    const permissions = [{
      moduleDefinition: {
        module: 'https://evil.example/modules/verified-account',
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          module: 'https://evil.example/modules/verified-account',
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('View a custom data type')).toBeInTheDocument();
    expect(screen.getByText(/Custom module:\s*evil\.example\/modules\/verified-account/i)).toBeInTheDocument();
    expect(screen.getAllByText('Custom module').length).toBeGreaterThan(0);
    expect(screen.queryByText('Module at https://evil.example/modules/verified-account')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified Account')).not.toBeInTheDocument();
    expect(screen.queryByText('View your Verified Account')).not.toBeInTheDocument();
    expect(screen.queryByText('View')).not.toBeInTheDocument();
  });

  it('shows a single encrypted-data explanation for multiple encrypted rows', () => {
    const permissions = [
      {
        moduleDefinition: {
          module: 'https://example.com/modules/private-notes',
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
            module: 'https://example.com/modules/private-notes',
          },
        ],
      },
      {
        moduleDefinition: {
          module: 'https://example.com/modules/private-tasks',
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
            module: 'https://example.com/modules/private-tasks',
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
      moduleDefinition: {
        module: 'https://example.com/modules/private-tasks',
        types: {
          task: { encryptionRequired: true },
        },
        structure: {},
      },
      permissionScopes: [{
        interface: 'Records',
        method: 'Write',
        module: 'https://example.com/modules/private-tasks',
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText(/does not share private decryption keys/i)).toBeInTheDocument();
    expect(screen.queryByText(/Approval permanently shares decryption keys/i)).not.toBeInTheDocument();
  });

  it('merges duplicate permission entries for the same module into one access row', () => {
    const permissions = [
      {
        moduleDefinition: {
          module: tasksModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            module: tasksModule,
          },
        ],
      },
      {
        moduleDefinition: {
          module: tasksModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Write',
            module: tasksModule,
          },
        ],
      },
    ] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getByText('View and add or edit a custom data type')).toBeInTheDocument();
    expect(screen.queryByText('View a custom data type')).not.toBeInTheDocument();
    expect(screen.queryByText('Add or edit a custom data type')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Custom module:\s*example\.com\/modules\/tasks/i)).toHaveLength(1);
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Add or edit')).toBeInTheDocument();
  });

  it('shows wallet-owned module setup and an advanced module definition view', () => {
    const permissions = [{
      moduleDefinition: {
        module: tasksModule,
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
          module: tasksModule,
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{ [tasksModule]: 'install' }}
      />,
    );

    expect(screen.getByText('Wallet setup')).toBeInTheDocument();
    expect(screen.getByText('Will add setup')).toBeInTheDocument();
    expect(screen.getByText('Will add')).toBeInTheDocument();
    expect(screen.getByText(/Module setup controls record authorization/i)).toBeInTheDocument();
    expect(screen.getByText('Technical & setup details')).toBeInTheDocument();
    expect(screen.getByText(/Approval permanently shares decryption keys/i)).toBeInTheDocument();
    expect(screen.getByText('2 types')).toBeInTheDocument();
    expect(screen.getByText('2 paths')).toBeInTheDocument();
    expect(screen.getByText('task/comment')).toBeInTheDocument();
    expect(screen.getByText(/"module": "https:\/\/example\.com\/modules\/tasks"/)).toBeInTheDocument();
    expect(screen.getByText(/"encryptionRequired": true/)).toBeInTheDocument();
  });

  it('blocks a conflicting installed module setup', () => {
    const permissions = [{
      moduleDefinition: {
        module: tasksModule,
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          module: tasksModule,
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{ [tasksModule]: 'conflict' }}
      />,
    );

    expect(screen.getByText('Module setup conflict')).toBeInTheDocument();
    expect(screen.getByText(/will not replace a core module during a connection/i)).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });

  it('offers an override opt-in for a custom definition conflict', () => {
    const onOverrideAcknowledgedChange = vi.fn();
    const permissions = [{
      moduleDefinition: {
        module: notesModule,
        types: {},
        structure: {},
      },
      permissionScopes: [{
        interface: 'Records',
        method: 'Write',
        module: notesModule,
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{ [notesModule]: 'override' }}
        overrideAcknowledged={false}
        onOverrideAcknowledgedChange={onOverrideAcknowledgedChange}
      />,
    );

    // An override is NOT the hard-conflict notice.
    expect(screen.queryByText('Module setup conflict')).not.toBeInTheDocument();
    expect(screen.getByText(/replace my installed module/i)).toBeInTheDocument();

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(onOverrideAcknowledgedChange).toHaveBeenCalledWith(true);
  });

  it('surfaces an unavailable setup check and retries it', () => {
    const retry = vi.fn();
    const permissions = [{
      moduleDefinition: {
        module: tasksModule,
        types: {},
        structure: {},
      },
      permissionScopes: [{
        interface: 'Records',
        method: 'Read',
        module: tasksModule,
      }],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{ [tasksModule]: 'unavailable' }}
        onRetryModuleSetup={retry}
      />,
    );

    expect(screen.getByText('Module setup could not be verified')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry check' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('groups setup work separately from data areas that are already ready', () => {
    const permissions = [
      {
        moduleDefinition: {
          module: profileModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            module: profileModule,
          },
        ],
      },
      {
        moduleDefinition: {
          module: connectModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            module: connectModule,
          },
        ],
      },
      {
        moduleDefinition: {
          module: tasksModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            module: tasksModule,
          },
        ],
      },
      {
        moduleDefinition: {
          module: notesModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          {
            interface: 'Records',
            method: 'Read',
            module: notesModule,
          },
        ],
      },
    ] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{
          [profileModule]     : 'configured',
          [connectModule]     : 'configured',
          [tasksModule]       : 'install',
          [notesModule]       : 'upgrade',
        }}
      />,
    );

    expect(screen.getByText('Will add setup')).toBeInTheDocument();
    expect(screen.getByText('Will upgrade encryption')).toBeInTheDocument();
    expect(screen.getAllByText('Already ready').length).toBeGreaterThan(0);
    expect(screen.getByText(/The wallet will not change these/i)).toBeInTheDocument();
    expect(screen.getByText('Will add')).toBeInTheDocument();
    expect(screen.getByText('Encryption upgrade')).toBeInTheDocument();
    expect(screen.getAllByText(/identity\.foundation\/modules\/profile/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/identity\.foundation\/modules\/connect/i).length).toBeGreaterThan(0);
  });

  it('summarizes existing app access without repeating a separate notice', () => {
    const permissions = [{
      moduleDefinition: {
        module: tasksModule,
        types: {},
        structure: {},
      },
      permissionScopes: [
        {
          interface: 'Records',
          method: 'Read',
          module: tasksModule,
        },
      ],
    }] as unknown as ConnectPermissionRequest[];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{ [tasksModule]: 'configured' }}
        existingSessionCount={2}
      />,
    );

    expect(screen.getByText('Access lasts 1 hour')).toBeInTheDocument();
    expect(screen.getByText(/already has 2 active sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/separate session with 1 hour of access/i)).toBeInTheDocument();
    expect(screen.queryByText('Existing app access')).not.toBeInTheDocument();
  });

  it('pairs a verified @enbox/contexts companion inside its domain module card while keeping technical setup transparent', () => {
    const notesContextsModule = `${notesModule}/contexts`;
    const permissions: ConnectPermissionRequest[] = [
      {
        moduleDefinition: {
          module: notesModule,
          published: false,
          types: {
            note: {
              schema: 'https://example.com/schemas/note',
              dataFormats: ['application/json'],
            },
          },
          structure: {
            note: {},
          },
        },
        permissionScopes: [
          { interface: 'Records', method: 'Read', module: notesModule },
        ],
      },
      {
        moduleDefinition: createCanonicalContextCompanionDefinition(notesContextsModule),
        permissionScopes: [
          { interface: 'Records', method: 'Read', module: notesContextsModule },
          { interface: 'Records', method: 'Write', module: notesContextsModule },
          { interface: 'Messages', method: 'Read', module: notesContextsModule },
        ],
      },
    ];

    render(
      <PermissionDisplay
        permissions={permissions}
        moduleSetupStatuses={{
          [notesModule]         : 'install',
          [notesContextsModule] : 'install',
        }}
      />,
    );

    expect(screen.getByText('View a custom data type')).toBeInTheDocument();
    expect(screen.getByText('Shared contexts & invitations')).toBeInTheDocument();
    expect(
      screen.getByText('View and add or edit shared context invitations and your encrypted followed-context list.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Companion module:\s*example\.com\/modules\/notes\/contexts/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Companion grants: Messages.Read.')).toBeInTheDocument();
    // Even though `notes` itself is unencrypted, the paired companion's `follow` type is encrypted + Read-granted.
    expect(screen.getByText(/Approval permanently shares decryption keys/i)).toBeInTheDocument();
    // Distinct companion badges are shown because companion scopes (Read + Write) differ from root scopes (Read).
    expect(screen.getByText('Add or edit')).toBeInTheDocument();
    // Both modules remain individually listed in setup & technical details.
    expect(screen.getAllByText('Shared contexts companion').length).toBeGreaterThan(0);
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('renders a standalone verified companion clearly without promoting unverified URI slugs', () => {
    const companionUri = 'https://evil.example/modules/verified-account/contexts';
    const permissions: ConnectPermissionRequest[] = [{
      moduleDefinition: createCanonicalContextCompanionDefinition(companionUri),
      permissionScopes: [
        { interface: 'Records', method: 'Read', module: companionUri },
      ],
    }];

    render(<PermissionDisplay permissions={permissions} />);

    expect(
      screen.getByText('View shared context invitations and followed contexts'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Open invitation inbox and encrypted followed-context journal'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Companion module:\s*evil\.example\/modules\/verified-account\/contexts/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Verified Account/i)).not.toBeInTheDocument();
  });

  it('never pairs or promotes a spoofed /contexts definition', () => {
    const spoofedContextsUri = `${notesModule}/contexts`;
    const permissions: ConnectPermissionRequest[] = [
      {
        moduleDefinition: {
          module: notesModule,
          types: {},
          structure: {},
        },
        permissionScopes: [
          { interface: 'Records', method: 'Read', module: notesModule },
        ],
      },
      {
        moduleDefinition: {
          module: spoofedContextsUri,
          types: {
            secret: { schema: 'https://evil.example/secret' },
          },
          structure: {
            secret: {},
          },
        },
        permissionScopes: [
          { interface: 'Records', method: 'Read', module: spoofedContextsUri },
        ],
      },
    ];

    render(<PermissionDisplay permissions={permissions} />);

    expect(screen.getAllByText('View a custom data type')).toHaveLength(2);
    expect(screen.queryByText('Shared contexts & invitations')).not.toBeInTheDocument();
    expect(screen.getByText(/Custom module:\s*example\.com\/modules\/notes\/contexts/i)).toBeInTheDocument();
  });
});
