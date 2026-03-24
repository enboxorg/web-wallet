import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar } from '../Avatar';

describe('Avatar', () => {
  it('renders image when src is provided', () => {
    render(<Avatar src="https://example.com/photo.jpg" name="Alice" />);
    const img = screen.getByRole('img', { name: 'Alice' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('shows initials fallback when no src', () => {
    render(<Avatar name="Bob" />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('uppercases the first letter of the name for initials', () => {
    render(<Avatar name="charlie" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('shows "?" when name is undefined', () => {
    render(<Avatar />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('shows "?" when name is empty string', () => {
    render(<Avatar name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('uses alt "Avatar" when name is not provided but src is', () => {
    render(<Avatar src="https://example.com/photo.jpg" />);
    expect(screen.getByRole('img', { name: 'Avatar' })).toBeInTheDocument();
  });

  it.each([
    ['sm', 'h-8'],
    ['md', 'h-12'],
    ['lg', 'h-16'],
    ['xl', 'h-24'],
  ] as const)('size "%s" applies correct class', (size, expectedClass) => {
    const { container } = render(<Avatar name="A" size={size} />);
    expect(container.firstChild).toHaveClass(expectedClass);
  });

  it('defaults to md size', () => {
    const { container } = render(<Avatar name="A" />);
    expect(container.firstChild).toHaveClass('h-12', 'w-12');
  });

  it('accepts className prop', () => {
    const { container } = render(<Avatar name="A" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('applies accent-muted background when no src', () => {
    const { container } = render(<Avatar name="A" />);
    expect(container.firstChild).toHaveClass('bg-accent-muted');
  });

  it('does not apply accent-muted background when src is provided', () => {
    const { container } = render(<Avatar src="https://example.com/photo.jpg" name="A" />);
    expect(container.firstChild).not.toHaveClass('bg-accent-muted');
  });
});
