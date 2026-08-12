import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';
import { RefreshUnavailableDisplay } from '../RefreshUnavailableDisplay';
import { refreshUnavailableMessage } from '../refresh-unavailable';

function detection(matchState: ConnectRefreshDetection['matchState']): ConnectRefreshDetection {
  return {
    isRefresh : true,
    matchState,
    status    : 'none',
  };
}

describe('refreshUnavailableMessage', () => {
  it('explains a lookup failure', () => {
    expect(refreshUnavailableMessage({
      appName        : 'Example App',
      detection      : detection('not-found'),
      lookupError    : true,
      ownerSupported : true,
    })).toMatch(/could not verify the previous connection/i);
  });

  it('explains a missing session for the delegate', () => {
    expect(refreshUnavailableMessage({
      appName        : 'Example App',
      detection      : detection('not-found'),
      lookupError    : false,
      ownerSupported : true,
    })).toMatch(/does not exist in this wallet/i);
  });

  it('explains a profile mismatch', () => {
    expect(refreshUnavailableMessage({
      appName        : 'Example App',
      detection      : detection('profile-mismatch'),
      lookupError    : false,
      ownerSupported : true,
    })).toMatch(/different profile/i);
  });

  it('explains an ambiguous delegate', () => {
    expect(refreshUnavailableMessage({
      appName        : 'Example App',
      detection      : detection('ambiguous'),
      lookupError    : false,
      ownerSupported : true,
    })).toMatch(/more than one profile/i);
  });

  it('explains an unsupported owner profile', () => {
    expect(refreshUnavailableMessage({
      appName        : 'Example App',
      detection      : detection('matched'),
      lookupError    : false,
      ownerSupported : false,
    })).toMatch(/no longer supports the profile/i);
  });
});

describe('RefreshUnavailableDisplay', () => {
  it('renders the title and message without any approval affordance', () => {
    render(
      <RefreshUnavailableDisplay
        appName="Example App"
        detection={detection('not-found')}
        lookupError={false}
        ownerSupported
      />,
    );

    expect(screen.getByText('Connection cannot be renewed')).toBeInTheDocument();
    expect(screen.getByText(/does not exist in this wallet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
