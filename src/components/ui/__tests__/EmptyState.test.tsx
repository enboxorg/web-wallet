import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders title as an h3 element', () => {
    render(<EmptyState title="No items found" />);
    const heading = screen.getByText('No items found');
    expect(heading.tagName).toBe('H3');
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try adding something" />);
    expect(screen.getByText('Try adding something')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('renders icon when provided', () => {
    render(
      <EmptyState
        title="Empty"
        icon={<svg data-testid="custom-icon" />}
      />,
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('does not render icon wrapper when icon is not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const iconWrapper = container.querySelector('.text-text-ghost');
    expect(iconWrapper).not.toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Add Item</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });

  it('does not render action wrapper when action is not provided', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const actionWrapper = container.querySelector('.mt-2');
    expect(actionWrapper).not.toBeInTheDocument();
  });

  it('accepts className prop', () => {
    const { container } = render(<EmptyState title="Empty" className="extra" />);
    expect(container.firstChild).toHaveClass('extra');
  });
});
