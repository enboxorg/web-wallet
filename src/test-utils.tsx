/**
 * Test utilities for rendering components with all required providers.
 *
 * Following Testing Library best practices:
 * - Use screen for queries
 * - Use userEvent for interactions
 * - Render with all needed providers (QueryClient, Router, etc.)
 */

import { type ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

/** Create a fresh QueryClient for each test (no shared cache). */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface WrapperOptions {
  /** Initial route for MemoryRouter */
  initialRoute?: string;
  /** Pre-existing query client (for seeding cache) */
  queryClient?: QueryClient;
}

/**
 * Render a component wrapped in all app-level providers.
 * Returns userEvent instance for interactions.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & WrapperOptions,
) {
  const { initialRoute = '/', queryClient, ...renderOptions } = options ?? {};
  const testQueryClient = queryClient ?? createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  const user = userEvent.setup();
  const result = render(ui, { wrapper: Wrapper, ...renderOptions });

  return {
    ...result,
    user,
    queryClient: testQueryClient,
  };
}

/** Re-export everything from testing-library */
export { screen, within, waitFor } from '@testing-library/react';
export { default as userEvent } from '@testing-library/user-event';
