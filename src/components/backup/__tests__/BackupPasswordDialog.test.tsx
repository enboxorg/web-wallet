import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '@/test-utils';
import { BackupPasswordDialog } from '../BackupPasswordDialog';

describe('BackupPasswordDialog', () => {
  function setup() {
    const onConfirm = vi.fn(async () => undefined);
    const utils = renderWithProviders(
      <BackupPasswordDialog open subject="2 profiles" onClose={vi.fn()} onConfirm={onConfirm} />,
    );
    return { ...utils, onConfirm };
  }

  it('explains why the file is protected', () => {
    setup();
    expect(screen.getByText(/backup of 2 profiles includes private keys/i)).toBeInTheDocument();
    expect(screen.getByText(/can't be recovered if you forget it/i)).toBeInTheDocument();
  });

  it('refuses short or mismatched passwords', async () => {
    const { user, onConfirm } = setup();
    const submit = screen.getByRole('button', { name: /export protected file/i });

    await user.type(screen.getByLabelText('Backup password'), 'short');
    await user.type(screen.getByLabelText('Confirm password'), 'short');
    await user.click(submit);
    expect(screen.getByText(/at least 8 characters\.$/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Backup password'));
    await user.type(screen.getByLabelText('Backup password'), 'long enough here');
    await user.click(submit);
    expect(screen.getByText(/passwords don’t match/i)).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('hands over the password once it is usable', async () => {
    const { user, onConfirm } = setup();
    await user.type(screen.getByLabelText('Backup password'), 'correct horse battery');
    await user.type(screen.getByLabelText('Confirm password'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /export protected file/i }));
    expect(onConfirm).toHaveBeenCalledWith('correct horse battery');
  });
});
