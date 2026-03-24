import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageHeader } from '../PageHeader';

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}));

describe('PageHeader', () => {
  it('renders title as h1', () => {
    render(<PageHeader title="Dashboard" />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' });
    expect(heading).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<PageHeader title="Settings" description="Manage your account" />);
    expect(screen.getByText('Manage your account')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<PageHeader title="Settings" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('renders back link when backTo is provided', () => {
    render(<PageHeader title="Details" backTo="/list" />);
    const link = screen.getByLabelText('Back');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/list');
  });

  it('does not render back link when backTo is not provided', () => {
    render(<PageHeader title="Home" />);
    expect(screen.queryByLabelText('Back')).not.toBeInTheDocument();
  });

  it('renders actions slot', () => {
    render(
      <PageHeader
        title="Users"
        actions={<button>Add User</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add User' })).toBeInTheDocument();
  });

  it('does not render actions wrapper when actions is not provided', () => {
    const { container } = render(<PageHeader title="Page" />);
    // The actions wrapper has flex items-center gap-2
    // If no actions, the div should not exist
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(0);
  });

  it('accepts className prop', () => {
    const { container } = render(<PageHeader title="Page" className="custom-header" />);
    expect(container.firstChild).toHaveClass('custom-header');
  });
});
