import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFoundPage from '../NotFoundPage';

vi.mock('react-router', () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe('NotFoundPage', () => {
  it('renders "Page not found" heading', () => {
    render(<NotFoundPage />);
    expect(
      screen.getByRole('heading', { name: /page not found/i }),
    ).toBeInTheDocument();
  });

  it('has a link to "/"', () => {
    render(<NotFoundPage />);
    const link = screen.getByRole('link', { name: /go to identities/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders the FileQuestion icon area', () => {
    render(<NotFoundPage />);
    // The lucide FileQuestion icon renders as an <svg> element
    const container = screen.getByText(/page not found/i).closest('div');
    expect(container).toBeInTheDocument();
    const svg = container!.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows a helpful description message', () => {
    render(<NotFoundPage />);
    expect(
      screen.getByText(
        /the page you're looking for doesn't exist or has been moved/i,
      ),
    ).toBeInTheDocument();
  });
});
