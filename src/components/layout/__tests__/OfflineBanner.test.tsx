import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useAuthStore } from '@/stores/auth-store';
import { OfflineBanner } from '../OfflineBanner';

describe('OfflineBanner', () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
    useAuthStore.setState({ agent: null });
  });

  it('returns null when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    const { container } = render(<OfflineBanner />);
    expect(container.innerHTML).toBe('');
  });

  it('shows banner when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('shows the offline message text', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    render(<OfflineBanner />);
    expect(
      screen.getByText(/changes will sync when you reconnect/i),
    ).toBeInTheDocument();
  });

  it('shows banner when browser goes offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    render(<OfflineBanner />);
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    fireEvent(window, new Event('offline'));
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('hides banner when browser comes back online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    render(<OfflineBanner />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();

    // Simulate coming back online
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    fireEvent(window, new Event('online'));
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it('warns when the browser is online but sync cannot reach the server', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    useAuthStore.setState({
      agent: { sync: { connectivityState: 'offline', on: () => () => {} } },
    });
    render(<OfflineBanner />);
    expect(screen.getByText(/can't reach the sync server/i)).toBeInTheDocument();
  });
});
