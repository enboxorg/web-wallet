import type { ConnectPermissionRequest } from '@enbox/connect';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';

import { RenewSessionDisplay } from '../RenewSessionDisplay';

const permissions = [{
  protocolDefinition: {
    protocol  : 'https://example.com/protocols/tasks',
    published : false,
    types     : {},
    structure : {},
  },
  permissionScopes: [{
    interface : 'Records',
    method    : 'Read',
    protocol  : 'https://example.com/protocols/tasks',
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
        protocolSetupStatuses={{ 'https://example.com/protocols/tasks': 'configured' }}
        requesterLabel="https://app.example"
        now={new Date('2026-07-13T12:00:00.000Z')}
      />,
    );

    expect(screen.getByText('Renew access for Example App')).toBeInTheDocument();
    expect(screen.getByText(/Renewing as/)).toHaveTextContent('Renewing as Alice');
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Previous access expires in 2 hours')).toBeInTheDocument();
    expect(screen.getByText('New access period: 24 hours')).toBeInTheDocument();
    expect(screen.getByText('View a custom data type')).toBeVisible();
    expect(screen.queryByText(/separate session/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('technical-setup-details')).not.toHaveAttribute('open');
  });

  it('keeps protocol approval blockers visible during renewal', () => {
    render(
      <RenewSessionDisplay
        appName="Example App"
        permissions={permissions}
        detection={matchedDetection}
        lookupPending={false}
        lookupError={false}
        ownerLabel="Alice"
        ownerSupported
        protocolSetupStatuses={{ 'https://example.com/protocols/tasks': 'conflict' }}
      />,
    );

    expect(screen.getByText('Protocol setup conflict')).toBeVisible();
  });
});
