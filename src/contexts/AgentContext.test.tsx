import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// ── Hoisted mocks ────────────────────────────────────────────────────────

const {
  mockStart,
  mockFirstLaunch,
  mockVaultLock,
  mockSyncStartSync,
  mockDidClose,
  mockAgent,
} = vi.hoisted(() => {
  const mockStart = vi.fn().mockResolvedValue(undefined);
  const mockFirstLaunch = vi.fn().mockResolvedValue(false);
  const mockVaultLock = vi.fn().mockResolvedValue(undefined);
  const mockSyncStartSync = vi.fn();
  const mockDidClose = vi.fn().mockResolvedValue(undefined);

  const mockAgent = {
    start       : mockStart,
    firstLaunch : mockFirstLaunch,
    initialize  : vi.fn().mockResolvedValue('word1 word2 word3'),
    vault       : { lock: mockVaultLock },
    agentDid    : { uri: 'did:dht:agent123' },
    did         : { close: mockDidClose },
    sync: {
      registerIdentity : vi.fn().mockResolvedValue(undefined),
      sync             : vi.fn().mockResolvedValue(undefined),
      startSync        : mockSyncStartSync,
      stopSync         : vi.fn().mockResolvedValue(undefined),
    },
  };

  return { mockStart, mockFirstLaunch, mockVaultLock, mockSyncStartSync, mockDidClose, mockAgent };
});

vi.mock('@enbox/agent', () => ({
  Web5UserAgent: {
    create: vi.fn().mockResolvedValue(mockAgent),
  },
}));

vi.mock('@toolpad/core', () => ({
  AppProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/Loader', () => ({
  default: ({ message }: { message: string }) => <div data-testid="loader">{message}</div>,
}));

vi.mock('@/components/LoadAgent', () => ({
  default: ({ initialized, unlock, initialize }: any) => (
    <div data-testid="load-agent">
      <span data-testid="initialized">{String(initialized)}</span>
      <button data-testid="unlock-btn" onClick={() => unlock('testpass')}>Unlock</button>
      <button data-testid="init-btn" onClick={() => initialize('newpass', ['https://dwn.example.com'])}>Initialize</button>
    </div>
  ),
}));

vi.mock('@mui/material/styles', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@mui/material', () => ({
  CssBaseline: () => null,
}));

vi.mock('@/theme/muiTheme', () => ({
  darkTheme: {},
}));

import { AgentProvider, AgentContext } from './AgentContext';

// ── Consumer ─────────────────────────────────────────────────────────────

const AgentConsumer: React.FC = () => {
  const { agent, initialized, unlocked, lock } = React.useContext(AgentContext);
  return (
    <div>
      <span data-testid="has-agent">{String(!!agent)}</span>
      <span data-testid="is-initialized">{String(initialized)}</span>
      <span data-testid="is-unlocked">{String(unlocked)}</span>
      <button data-testid="lock-btn" onClick={() => lock()}>Lock</button>
    </div>
  );
};

describe('AgentContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockFirstLaunch.mockResolvedValue(false);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should render LoadAgent when not unlocked', async () => {
    render(
      <AgentProvider>
        <AgentConsumer />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('load-agent')).toBeInTheDocument();
    });
  });

  it('should show initialized=true for an existing agent', async () => {
    mockFirstLaunch.mockResolvedValue(false);

    render(
      <AgentProvider>
        <AgentConsumer />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('initialized')).toHaveTextContent('true');
    });
  });

  it('should show initialized=false for a first-launch agent', async () => {
    mockFirstLaunch.mockResolvedValue(true);

    render(
      <AgentProvider>
        <AgentConsumer />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('initialized')).toHaveTextContent('false');
    });
  });

  it('should auto-unlock from localStorage password', async () => {
    localStorage.setItem('password', 'savedpass');

    render(
      <AgentProvider>
        <AgentConsumer />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith({ password: 'savedpass' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-unlocked')).toHaveTextContent('true');
    });
  });

  it('should start live sync on unlock', async () => {
    localStorage.setItem('password', 'savedpass');

    render(
      <AgentProvider>
        <AgentConsumer />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(mockSyncStartSync).toHaveBeenCalledWith({ mode: 'live', interval: '5m' });
    });
  });

  it('should lock the agent and close the DID resolver cache', async () => {
    localStorage.setItem('password', 'savedpass');

    render(
      <AgentProvider>
        <AgentConsumer />
      </AgentProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-unlocked')).toHaveTextContent('true');
    });

    await act(async () => {
      screen.getByTestId('lock-btn').click();
    });

    expect(mockVaultLock).toHaveBeenCalled();
    expect(mockDidClose).toHaveBeenCalled();
    expect(localStorage.getItem('password')).toBeNull();
  });
});

describe('AgentContext default value', () => {
  it('should provide default context values', () => {
    const consumer = render(
      <AgentContext.Consumer>
        {(value) => (
          <div>
            <span data-testid="default-unlocked">{String(value.unlocked)}</span>
            <span data-testid="default-initialized">{String(value.initialized)}</span>
            <span data-testid="default-agent">{String(value.agent)}</span>
          </div>
        )}
      </AgentContext.Consumer>,
    );

    expect(consumer.getByTestId('default-unlocked')).toHaveTextContent('false');
    expect(consumer.getByTestId('default-initialized')).toHaveTextContent('false');
    expect(consumer.getByTestId('default-agent')).toHaveTextContent('undefined');
  });
});
