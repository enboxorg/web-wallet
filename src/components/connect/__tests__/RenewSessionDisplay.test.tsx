import type { ConnectPermissionRequest } from '@enbox/connect';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';

import { RenewSessionDisplay } from '../RenewSessionDisplay';

const permissions = [{
  moduleDefinition: {
    module  : 'https://example.com/modules/tasks',
    published : false,
    types     : {},
    structure : {},
  },
  permissionScopes: [{
    interface : 'Records',
    method    : 'Read',
    module  : 'https://example.com/modules/tasks',
  }],
}] as ConnectPermissionRequest[];

const matchedDetection: ConnectRefreshDetection = {
  isRefresh      : true,
  matchState     : 'matched',
  status         : 'active',
  pinnedOwnerDid : 'did:dht:alice',
  expiresAt      : '2026-07-13T14:00:00.000Z',
};

describe('RenewSessionDisplay', () => {
  it('shows renewal context while keeping requested access visible', () => {
    render(
      <RenewSessionDisplay
        appName="Example App"
        permissions={permissions}
        detection={matchedDetection}
        lookupPending={false}
        lookupError={false}
        ownerLabel="Alice"
        ownerSupported
        moduleSetupStatuses={{ 'https://example.com/modules/tasks': 'configured' }}
        requesterLabel="https://app.example"
        now={new Date('2026-07-13T12:00:00.000Z')}
      />,
    );

    expect(screen.getByText('Renew access for Example App')).toBeInTheDocument();
    expect(screen.getByText(/Renewing as/)).toHaveTextContent('Renewing as Alice');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Previous access expires in 2 hours')).toBeInTheDocument();
    expect(screen.getByText('New access period: 1 hour')).toBeInTheDocument();
    expect(screen.getByText('View a custom data type')).toBeVisible();
    expect(screen.queryByText(/separate session/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('technical-setup-details')).not.toHaveAttribute('open');
  });

  it('keeps module approval blockers visible during renewal', () => {
    render(
      <RenewSessionDisplay
        appName="Example App"
        permissions={permissions}
        detection={matchedDetection}
        lookupPending={false}
        lookupError={false}
        ownerLabel="Alice"
        ownerSupported
        moduleSetupStatuses={{ 'https://example.com/modules/tasks': 'conflict' }}
      />,
    );

    expect(screen.getByText('Module setup conflict')).toBeVisible();
  });

  it('explains when the exact previous session was revoked', () => {
    render(
      <RenewSessionDisplay
        appName="Example App"
        permissions={permissions}
        detection={{ ...matchedDetection, status: 'revoked' }}
        lookupPending={false}
        lookupError={false}
        ownerLabel="Alice"
        ownerSupported
      />,
    );

    expect(screen.getByText('Revoked')).toBeVisible();
    expect(screen.getByText('Previous access was revoked.')).toBeVisible();
  });

  it('distinguishes a partially revoked permission bundle from a revoked session', () => {
    render(
      <RenewSessionDisplay
        appName="Example App"
        permissions={permissions}
        detection={{ ...matchedDetection, status: 'permissions-changed' }}
        lookupPending={false}
        lookupError={false}
        ownerLabel="Alice"
        ownerSupported
      />,
    );

    expect(screen.getByText('Permissions changed')).toBeVisible();
    expect(screen.getByText('Some previous permissions were revoked.')).toBeVisible();
    expect(screen.queryByText('Previous access was revoked.')).not.toBeInTheDocument();
  });

  it('explains when a refresh names a different previous profile', () => {
    render(
      <RenewSessionDisplay
        appName="Example App"
        permissions={permissions}
        detection={{
          isRefresh : true,
          matchState: 'profile-mismatch',
          status    : 'none',
        }}
        lookupPending={false}
        lookupError={false}
        ownerSupported={false}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This request names a different profile than the previous session. Renewal is blocked.',
    );
  });
});
