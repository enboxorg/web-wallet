import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@/test-utils';
import { encryptBackup } from '@/lib/encrypted-backup';
import ImportIdentityPage from '../ImportIdentityPage';

const mocks = vi.hoisted(() => ({
  importIdentity : vi.fn(),
  toastSuccess   : vi.fn(),
}));

vi.mock('@/enbox/hooks/use-identity-mutations', () => ({
  useImportIdentity: () => ({ mutateAsync: mocks.importIdentity }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}));

const alice = { portableDid: { uri: 'did:dht:alice1234567890' }, metadata: { name: 'Personal' } };
const bob = { portableDid: { uri: 'did:dht:bob1234567890' }, metadata: { name: 'Work' } };

function upload(name: string, contents: unknown) {
  const file = new File([JSON.stringify(contents)], name, { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('Choose backup files'), { target: { files: [file] } });
}

describe('ImportIdentityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.importIdentity.mockResolvedValue(undefined);
  });

  it('imports each profile in an "Export all" file and reports the real count', async () => {
    const { user } = renderWithProviders(<ImportIdentityPage />);
    upload('enbox-profiles.json', [alice, bob]);

    expect(await screen.findByText('enbox-profiles.json · Personal')).toBeInTheDocument();
    expect(screen.getByText('enbox-profiles.json · Work')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Import 2 profiles' }));

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Imported 2 profiles'));
    expect(mocks.importIdentity).toHaveBeenCalledTimes(2);
    expect(mocks.importIdentity).toHaveBeenCalledWith(alice);
    expect(mocks.importIdentity).toHaveBeenCalledWith(bob);
    expect(screen.getByText('2 of 2 imported.')).toBeInTheDocument();
  });

  it('unlocks a password-protected backup before importing it', async () => {
    const backup = await encryptBackup([alice, bob], 'correct horse battery', { iterations: 100_000 });
    const { user } = renderWithProviders(<ImportIdentityPage />);
    upload('protected.json', backup);

    const password = await screen.findByLabelText('Password for protected.json');
    expect(screen.getByText('Password protected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();

    await user.type(password, 'wrong password');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText(/didn’t unlock this backup/)).toBeInTheDocument();
    expect(mocks.importIdentity).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Password for protected.json'));
    await user.type(screen.getByLabelText('Password for protected.json'), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByText('protected.json · Personal')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 2 profiles' }));
    await waitFor(() => expect(mocks.importIdentity).toHaveBeenCalledTimes(2));
  });

  it('flags files that are not backups', async () => {
    renderWithProviders(<ImportIdentityPage />);
    const file = new File(['not json'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText('Choose backup files'), { target: { files: [file] } });
    expect(await screen.findByText('Not a backup file')).toBeInTheDocument();
  });
});
