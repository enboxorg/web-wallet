import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IdentityCard } from '../IdentityCard';

const longDid = 'did:dht:abc12345678901234567890123456789xyz12345678901234567890';

describe('IdentityCard', () => {
  it('renders the display name', () => {
    render(<IdentityCard did={longDid} displayName="Alice" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders "Unnamed" when no displayName is provided', () => {
    render(<IdentityCard did={longDid} />);
    expect(screen.getByText('Unnamed')).toBeInTheDocument();
  });

  it('renders a truncated DID', () => {
    render(<IdentityCard did={longDid} displayName="Alice" />);
    const didEl = screen.getByText(/did:dht:.*\.\.\..*/);
    expect(didEl).toBeInTheDocument();
  });

  it('renders the avatar with the name initial', () => {
    render(<IdentityCard did={longDid} displayName="Bob" />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('renders hero image when heroUrl is provided', () => {
    render(<IdentityCard did={longDid} heroUrl="/hero.jpg" />);
    const img = document.querySelector('img[src="/hero.jpg"]');
    expect(img).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<IdentityCard did={longDid} displayName="Alice" onClick={onClick} />);
    // Click the card itself (not the copy button)
    const card = screen.getByText('Alice').closest('[role="button"]')!;
    await user.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies hover classes when clickable', () => {
    render(<IdentityCard did={longDid} onClick={() => {}} />);
    const card = document.querySelector('[role="button"][tabindex="0"]')!;
    expect(card.className).toContain('hover:border-border-strong');
    expect(card.className).toContain('hover:shadow-md');
  });
});
