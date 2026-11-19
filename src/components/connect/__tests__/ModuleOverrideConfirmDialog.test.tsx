import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ModuleOverrideConfirmDialog } from '../ModuleOverrideConfirmDialog';

const notes = 'https://fieldnotes.example/modules/notes/v2';
const tags = 'https://fieldnotes.example/modules/tags';

describe('ModuleOverrideConfirmDialog', () => {
  it('names every module being replaced by its full URI', () => {
    render(<ModuleOverrideConfirmDialog open modules={[notes, tags]} onConfirm={vi.fn()} onCancel={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Replace installed module setup?' });
    expect(within(dialog).getByText('Notes')).toBeInTheDocument();
    expect(within(dialog).getByText('Tags')).toBeInTheDocument();
    // The URI is the identity of what gets replaced, so it is never shortened.
    const uris = within(dialog).getAllByTestId('module-uri');
    expect(uris.map((uri) => uri.textContent)).toEqual([notes, tags]);
    for (const uri of uris) expect(uri).not.toHaveClass('truncate');
  });

  it('runs the matching callback for each choice', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ModuleOverrideConfirmDialog open modules={[notes]} onConfirm={onConfirm} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: /Replace & connect/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
