import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ModuleUri } from '../ModuleUri';

describe('ModuleUri', () => {
  it('shows the whole URI and marks the host', () => {
    const uri = 'https://fieldnotes.example/modules/notes/v1';
    render(<ModuleUri uri={uri} />);

    const shown = screen.getByTestId('module-uri');
    expect(shown).toHaveTextContent(uri);
    expect(shown).toHaveClass('wrap-anywhere');
    expect(shown).not.toHaveClass('truncate');
    expect(within(shown).getByText('fieldnotes.example')).toHaveClass('text-text-primary');
  });

  it('lets a long URI wrap between path segments without changing its text', () => {
    const uri = 'https://harbor.example/modules/direct-messages/v2';
    render(<ModuleUri uri={uri} />);

    const shown = screen.getByTestId('module-uri');
    // One break opportunity after each "/" that starts a path segment.
    // eslint-disable-next-line testing-library/no-node-access
    expect(shown.querySelectorAll('wbr')).toHaveLength(3);
    expect(shown.textContent).toBe(uri);
  });

  it('shows a non-web URI as written', () => {
    render(<ModuleUri uri="urn:example:notes" />);

    expect(screen.getByText('urn:example:notes')).toBeInTheDocument();
  });
});
