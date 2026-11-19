import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectPermissionRequest } from '@enbox/connect';

import { createCanonicalContextCompanionDefinition, getCanonicalModuleDefinition } from '@/lib/module-names';
import { PermissionDisplay } from '../PermissionDisplay';

const tasksModule = 'https://example.com/modules/tasks';
const notesModule = 'https://example.com/modules/notes';
const profileModule = 'https://identity.foundation/modules/profile';
const connectModule = 'https://identity.foundation/modules/connect';

/** Chip labels of the n-th "Allowed actions" list inside `scope`. */
function chips(scope: HTMLElement, index = 0): string[] {
  const list = within(scope).getAllByRole('list', { name: 'Allowed actions' })[index];
  return within(list).getAllByRole('listitem').map((item) => item.textContent ?? '');
}

/** The module URIs written out in full inside `scope`, in order. */
function shownUris(scope: HTMLElement): string[] {
  return within(scope).queryAllByTestId('module-uri').map((element) => element.textContent ?? '');
}

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
    const rows = screen.getAllByRole('listitem', { name: 'Tasks' });
    expect(rows).toHaveLength(1);
    expect(shownUris(rows[0])).toEqual([tasksModule]);
    expect(chips(rows[0])).toEqual(['View']);
    expect(screen.getByText(/Dependencies listed only for setup do not grant the app access/)).toBeInTheDocument();
    expect(shownUris(screen.getByTestId('technical-setup-details'))).toContain(provider);
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
    expect(screen.getByText('Access lasts 7 days')).toBeInTheDocument();
    const row = screen.getByRole('listitem', { name: 'Demo' });
    expect(shownUris(row)).toEqual(['https://example.com/modules/demo']);
    // Record access leads; sync + setup plumbing becomes one note under the list.
    expect(chips(row)).toEqual(['View', 'Add or edit', 'Delete']);
    expect(screen.getAllByText('The app can also sync changes and check the setup of Demo.')).toHaveLength(1);
    expect(screen.queryByText('Query')).not.toBeInTheDocument();
    // Every granted scope stays disclosed verbatim in the technical details.
    expect(screen.getAllByText('Modules.Query')).toHaveLength(1);
    expect(screen.getAllByText('Messages.Read')).toHaveLength(1);
    expect(screen.getByTestId('technical-setup-details')).not.toHaveAttribute('open');
  });

  it('names the items with sync and setup when only some include it', () => {
    const scopes = (module: string, support: boolean) => [
      ...(support ? [{ interface: 'Messages', method: 'Read', module }, { interface: 'Modules', method: 'Query', module }] : []),
      { interface: 'Records', method: 'Read', module },
    ];
    const request = (module: string, support: boolean) => ({
      moduleDefinition : { module, types: {}, structure: {} },
      permissionScopes : scopes(module, support),
    });
    render(<PermissionDisplay permissions={[
      request('https://example.com/modules/tasks', true),
      request('https://example.com/modules/notes', false),
    ] as unknown as ConnectPermissionRequest[]} />);

    expect(screen.getByText('The app can also sync changes and check the setup of Tasks.')).toBeInTheDocument();
    expect(chips(screen.getByRole('listitem', { name: 'Tasks' }))).toEqual(['View']);
  });

  it('says "each of these" only when it applies to every item', () => {
    const request = (module: string) => ({
      moduleDefinition : { module, types: {}, structure: {} },
      permissionScopes : [
        { interface: 'Messages', method: 'Read', module },
        { interface: 'Records', method: 'Read', module },
      ],
    });
    render(<PermissionDisplay permissions={[
      request('https://example.com/modules/tasks'),
      request('https://example.com/modules/notes'),
    ] as unknown as ConnectPermissionRequest[]} />);

    expect(screen.getByText(/check how each of these is set up/)).toBeInTheDocument();
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

    const row = screen.getByRole('listitem', { name: 'Demo' });
    // With no record access, the support scope *is* the capability and is shown plainly.
    expect(chips(row)).toEqual(['Sync changes']);
    expect(screen.getByText('Messages.Read')).toBeInTheDocument();
  });

  it('names unknown modules from their own URI, always beside that URI in full', () => {
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

    // The name is only what the URI says, so the whole URI is always shown with it,
    // with the host that namespaces it marked.
    const row = screen.getByRole('listitem', { name: 'Verified Account' });
    expect(shownUris(row)).toEqual(['https://evil.example/modules/verified-account']);
    expect(within(row).getByText('evil.example')).toHaveClass('text-text-primary');
    expect(within(row).getByText('Third-party')).toBeInTheDocument();
    expect(chips(row)).toEqual(['View']);
    expect(screen.queryByText('Module at https://evil.example/modules/verified-account')).not.toBeInTheDocument();
    expect(within(row).queryByText('Shared contexts')).not.toBeInTheDocument();
  });

  it('keeps curated copy for pinned module URIs whose definition does not match', () => {
    const permissions = [{
      moduleDefinition: { module: profileModule, types: {}, structure: {} },
      permissionScopes: [{ interface: 'Records', method: 'Read', module: profileModule }],
    }] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    const row = screen.getByRole('listitem', { name: 'Profile' });
    expect(shownUris(row)).toEqual([profileModule]);
    expect(within(row).getByText('Third-party')).toBeInTheDocument();
    expect(screen.queryByText(/Public profile data/i)).not.toBeInTheDocument();
  });

  it('tags every module that is not a built-in definition as third-party', () => {
    const profile = getCanonicalModuleDefinition(profileModule)!;
    const permissions = [
      {
        moduleDefinition : profile,
        permissionScopes : [{ interface: 'Records', method: 'Read', module: profileModule }],
      },
      {
        moduleDefinition : { module: 'https://evil.example/modules/profile', types: {}, structure: {} },
        permissionScopes : [{ interface: 'Records', method: 'Read', module: 'https://evil.example/modules/profile' }],
      },
    ] as unknown as ConnectPermissionRequest[];

    render(<PermissionDisplay permissions={permissions} />);

    // Same name, different module URI: only the built-in definition goes untagged.
    const [builtIn, thirdParty] = screen.getAllByRole('listitem', { name: 'Profile' });
    expect(within(builtIn).getByText(/Public profile data/i)).toBeInTheDocument();
    expect(within(builtIn).queryByText('Third-party')).not.toBeInTheDocument();
    expect(within(thirdParty).getByText('Third-party')).toBeInTheDocument();
    // Both show their URI in full, so the two "Profile" rows can be told apart.
    expect(shownUris(builtIn)).toEqual([profileModule]);
    expect(shownUris(thirdParty)).toEqual(['https://evil.example/modules/profile']);
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

    expect(screen.getAllByText(/Approval shares decryption keys for these scopes/i)).toHaveLength(1);
    expect(screen.queryByText(/permanently/i)).not.toBeInTheDocument();
    expect(screen.getByText(/matching ciphertext obtained now or later can still be decrypted/i)).toBeInTheDocument();
    for (const name of ['Private Notes', 'Private Tasks']) {
      const row = screen.getByRole('listitem', { name });
      expect(within(row).getByText('Encrypted')).toBeInTheDocument();
      expect(within(row).getByText(/Approving shares its decryption keys/i)).toBeInTheDocument();
    }
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

    const row = screen.getByRole('listitem', { name: 'Private Tasks' });
    expect(within(row).getByText('Encrypted')).toBeInTheDocument();
    expect(within(row).getByText(/does not share private decryption keys/i)).toBeInTheDocument();
    expect(screen.queryByText(/Approval shares decryption keys/i)).not.toBeInTheDocument();
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

    const rows = screen.getAllByRole('listitem', { name: 'Tasks' });
    expect(rows).toHaveLength(1);
    expect(shownUris(rows[0])).toEqual([tasksModule]);
    expect(chips(rows[0])).toEqual(['View', 'Add or edit']);
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
    expect(screen.getByText(/Approval shares decryption keys/i)).toBeInTheDocument();
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

    expect(screen.getByText('Access lasts 7 days')).toBeInTheDocument();
    expect(screen.getByText(/already has 2 active sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/separate session with 7 days of access/i)).toBeInTheDocument();
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

    // One card for the domain module, with its companion nested inside.
    const row = screen.getByRole('listitem', { name: 'Notes' });
    expect(screen.queryByRole('listitem', { name: /contexts/i })).not.toBeInTheDocument();
    expect(chips(row, 0)).toEqual(['View']);
    const companion = within(row).getByRole('group', { name: 'Shared contexts & invitations' });
    expect(chips(companion)).toEqual(['View', 'Add or edit']);
    expect(screen.getByText(/also sync changes/i)).toBeInTheDocument();
    // Even though `notes` itself is unencrypted, the paired companion's `follow` type is encrypted + Read-granted.
    expect(within(row).getAllByText('Encrypted')).toHaveLength(1);
    expect(within(companion).getByText('Encrypted')).toBeInTheDocument();
    expect(screen.getByText(/Approval shares decryption keys/i)).toBeInTheDocument();
    // Both modules remain individually listed in setup & technical details.
    expect(screen.getAllByText('Notes shared contexts').length).toBeGreaterThan(0);
    expect(shownUris(screen.getByTestId('technical-setup-details'))).toContain(notesContextsModule);
    // The row names both modules it covers: the domain module, then its companion.
    expect(shownUris(row)).toEqual([notesModule, notesContextsModule]);
    expect(shownUris(companion)).toEqual([notesContextsModule]);
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('labels a standalone verified companion by its root module and shows its own URI', () => {
    const companionUri = 'https://evil.example/modules/verified-account/contexts';
    const permissions: ConnectPermissionRequest[] = [{
      moduleDefinition: createCanonicalContextCompanionDefinition(companionUri),
      permissionScopes: [
        { interface: 'Records', method: 'Read', module: companionUri },
      ],
    }];

    render(<PermissionDisplay permissions={permissions} />);

    const row = screen.getByRole('listitem', { name: 'Verified Account' });
    expect(chips(row)).toEqual(['View']);
    expect(within(row).getByText('Shared contexts')).toBeInTheDocument();
    expect(within(row).getByText('Third-party')).toBeInTheDocument();
    expect(shownUris(row)).toEqual([companionUri]);
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

    // Named from its own path segment, unpaired, and never tagged as shared contexts.
    expect(screen.getByRole('listitem', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Contexts' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Shared contexts & invitations' })).not.toBeInTheDocument();
    expect(screen.queryByText('Shared contexts')).not.toBeInTheDocument();
    expect(shownUris(screen.getByRole('listitem', { name: 'Contexts' }))).toEqual([spoofedContextsUri]);
  });
});
