import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EnboxLogo } from '../EnboxLogo';

describe('EnboxLogo', () => {
  it('renders "enbox" text', () => {
    render(<EnboxLogo />);
    // The logo renders as three separate spans: "en", "b", "ox"
    expect(screen.getByText('en')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('ox')).toBeInTheDocument();
  });

  it('renders "b" with accent styling', () => {
    render(<EnboxLogo />);
    const bSpan = screen.getByText('b');
    expect(bSpan.className).toContain('text-accent');
    expect(bSpan.className).toContain('font-bold');
  });

  it('shows subtitle "Identity Wallet"', () => {
    render(<EnboxLogo />);
    expect(screen.getByText('Identity Wallet')).toBeInTheDocument();
  });

  it('renders small size with text-xl', () => {
    const { container } = render(<EnboxLogo size="sm" />);
    const logoText = container.querySelector('.text-xl');
    expect(logoText).toBeInTheDocument();
  });

  it('renders medium size with text-3xl (default)', () => {
    const { container } = render(<EnboxLogo />);
    const logoText = container.querySelector('.text-3xl');
    expect(logoText).toBeInTheDocument();
  });

  it('renders large size with text-5xl', () => {
    const { container } = render(<EnboxLogo size="lg" />);
    const logoText = container.querySelector('.text-5xl');
    expect(logoText).toBeInTheDocument();
  });

  it('renders small subtitle text for sm size', () => {
    const { container } = render(<EnboxLogo size="sm" />);
    const subtitle = container.querySelector('.text-\\[10px\\]');
    expect(subtitle).toBeInTheDocument();
  });

  it('renders large subtitle text for lg size', () => {
    const { container } = render(<EnboxLogo size="lg" />);
    const subtitle = container.querySelector('.text-sm');
    expect(subtitle).toBeInTheDocument();
  });

  it('merges custom className', () => {
    const { container } = render(<EnboxLogo className="my-custom" />);
    expect(container.firstElementChild!.className).toContain('my-custom');
  });
});
