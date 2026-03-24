import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loader } from '../Loader';

describe('Loader', () => {
  it('renders spinner element with role="status"', () => {
    render(<Loader />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('spinner has aria-label "Loading"', () => {
    render(<Loader />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
  });

  it('shows message when provided', () => {
    render(<Loader message="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('does not show message when not provided', () => {
    const { container } = render(<Loader />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('fullScreen prop adds min-h-screen class', () => {
    const { container } = render(<Loader fullScreen />);
    expect(container.firstChild).toHaveClass('min-h-screen');
  });

  it('fullScreen prop adds bg-surface-0 class', () => {
    const { container } = render(<Loader fullScreen />);
    expect(container.firstChild).toHaveClass('bg-surface-0');
  });

  it('non-fullScreen has min-h-48 class', () => {
    const { container } = render(<Loader />);
    expect(container.firstChild).toHaveClass('min-h-48');
  });

  it('non-fullScreen does not have min-h-screen class', () => {
    const { container } = render(<Loader />);
    expect(container.firstChild).not.toHaveClass('min-h-screen');
  });

  it('spinner has animate-spin class', () => {
    render(<Loader />);
    expect(screen.getByRole('status')).toHaveClass('animate-spin');
  });
});
