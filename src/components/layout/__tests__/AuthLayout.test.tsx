import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthLayout } from '../AuthLayout';

describe('AuthLayout', () => {
  it('renders its content on the full-height stage', () => {
    render(<AuthLayout><p>Unlock</p></AuthLayout>);
    expect(screen.getByTestId('auth-layout')).toContainElement(screen.getByText('Unlock'));
    expect(screen.getByTestId('auth-layout')).toHaveClass('min-h-dvh', 'bg-surface-0', 'ambient');
  });

  it('keeps the column narrow by default and widens it on request', () => {
    const { rerender } = render(<AuthLayout><p>Content</p></AuthLayout>);
    expect(screen.getByTestId('auth-layout-column')).toHaveClass('max-w-sm');

    rerender(<AuthLayout width="md"><p>Content</p></AuthLayout>);
    expect(screen.getByTestId('auth-layout-column')).toHaveClass('max-w-md');
  });

  it('pads for notches and home indicators', () => {
    render(<AuthLayout><p>Content</p></AuthLayout>);
    const style = screen.getByTestId('auth-layout').getAttribute('style') ?? '';
    expect(style).toContain('safe-area-inset-top');
    expect(style).toContain('safe-area-inset-bottom');
  });

  it('merges a custom className', () => {
    render(<AuthLayout className="custom"><p>Content</p></AuthLayout>);
    expect(screen.getByTestId('auth-layout')).toHaveClass('custom');
  });
});
