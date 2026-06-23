import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  CONNECT_SESSION_DURATION_LABEL,
  SessionExpiryNotice,
} from '../SessionExpiryNotice';

describe('SessionExpiryNotice', () => {
  it('tells users connect sessions are temporary', () => {
    render(<SessionExpiryNotice />);

    expect(screen.getByText('Temporary session')).toBeInTheDocument();
    expect(screen.getByText(
      new RegExp(`permissions for ${CONNECT_SESSION_DURATION_LABEL}`, 'i'),
    )).toBeInTheDocument();
    expect(screen.getByText(/need to reconnect/i)).toBeInTheDocument();
  });
});
