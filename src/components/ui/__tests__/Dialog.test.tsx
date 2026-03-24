import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from '../Dialog';

describe('Dialog', () => {
  it('renders nothing when open is false', () => {
    render(
      <Dialog open={false} onClose={vi.fn()}>
        <p>Hidden content</p>
      </Dialog>,
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('renders children when open', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <p>Visible content</p>
      </Dialog>,
    );
    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(
      <Dialog open onClose={vi.fn()} title="My Dialog">
        <p>Body</p>
      </Dialog>,
    );
    expect(screen.getByText('My Dialog')).toBeInTheDocument();
  });

  it('has dialog role and aria-modal', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Accessible">
        <p>Content</p>
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        <p>Content</p>
      </Dialog>,
    );
    // The backdrop has aria-hidden="true"
    const backdrop = screen.getByRole('dialog').querySelector('[aria-hidden="true"]');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose}>
        <p>Content</p>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sets overflow hidden on body when open', () => {
    const { unmount } = render(
      <Dialog open onClose={vi.fn()}>
        <p>Content</p>
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('merges custom className', () => {
    render(
      <Dialog open onClose={vi.fn()} className="custom-dialog">
        <p>Content</p>
      </Dialog>,
    );
    const panel = screen.getByRole('dialog').querySelector('.custom-dialog');
    expect(panel).toBeInTheDocument();
  });
});
