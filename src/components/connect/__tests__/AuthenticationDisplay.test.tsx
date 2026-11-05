import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthenticationDisplay } from '../AuthenticationDisplay';

describe('AuthenticationDisplay', () => {
  it('shows the exact service identifier while keeping a readable host heading', () => {
    const firstAudience = 'https://login.example/issuers/personal';
    const secondAudience = 'https://login.example/issuers/work';
    const { rerender } = render(<AuthenticationDisplay audience={firstAudience} authenticationOnly />);

    expect(screen.getByRole('heading', { name: 'Sign in to login.example' })).toBeInTheDocument();
    expect(screen.getByText(firstAudience, { exact: true })).toBeVisible();
    expect(screen.getByText(/Continue only if you started this sign-in/)).toBeVisible();
    expect(screen.getByText('Sign-in only. This request does not grant access to your records.')).toBeVisible();

    rerender(<AuthenticationDisplay audience={secondAudience} authenticationOnly />);

    expect(screen.getByRole('heading', { name: 'Sign in to login.example' })).toBeInTheDocument();
    expect(screen.getByText(secondAudience, { exact: true })).toBeVisible();
    expect(screen.queryByText(firstAudience, { exact: true })).not.toBeInTheDocument();
  });

  it('retains the combined record-access disclosure beside the service and sign-in instruction', () => {
    const audience = 'https://login.example/issuers/work';
    render(<AuthenticationDisplay audience={audience} authenticationOnly={false} />);

    expect(screen.getByText(audience, { exact: true })).toBeVisible();
    expect(screen.getByText(/Continue only if you started this sign-in/)).toBeVisible();
    expect(screen.getByText('Your approval also grants the record access listed below.')).toBeVisible();
  });
});
