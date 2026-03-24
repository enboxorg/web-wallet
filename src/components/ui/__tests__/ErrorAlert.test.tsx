import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorAlert } from '../ErrorAlert';

describe('ErrorAlert', () => {
  it('renders message text', () => {
    render(<ErrorAlert message="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('has role="alert"', () => {
    render(<ErrorAlert message="Error occurred" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('contains AlertCircle icon (svg element)', () => {
    const { container } = render(<ErrorAlert message="Error" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('accepts className prop', () => {
    render(<ErrorAlert message="Error" className="extra-class" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('extra-class');
  });

  it('has error styling classes', () => {
    render(<ErrorAlert message="Error" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('rounded-lg');
  });

  it('renders the message inside a paragraph', () => {
    render(<ErrorAlert message="Check this" />);
    const paragraph = screen.getByText('Check this');
    expect(paragraph.tagName).toBe('P');
  });
});
