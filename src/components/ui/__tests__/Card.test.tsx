import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card><span>Hello World</span></Card>);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('default padding is md (p-5)', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass('p-5');
  });

  it('padding "sm" applies p-4', () => {
    const { container } = render(<Card padding="sm">Content</Card>);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('padding "md" applies p-5', () => {
    const { container } = render(<Card padding="md">Content</Card>);
    expect(container.firstChild).toHaveClass('p-5');
  });

  it('padding "lg" applies p-6', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('accepts className prop', () => {
    const { container } = render(<Card className="my-custom">Content</Card>);
    expect(container.firstChild).toHaveClass('my-custom');
  });

  it('has border and bg-surface-1 classes', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass('border', 'border-border-default', 'bg-surface-1');
  });

  it('has rounded-lg class', () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass('rounded-lg');
  });
});
