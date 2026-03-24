import { Suspense, useState, useCallback } from 'react';
import { Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { EnboxAuthProvider } from '@/enbox/provider';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useCreateIdentity } from '@/enbox/hooks/use-identity-mutations';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';

import { Loader } from '@/components/ui/Loader';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { DragDropOverlay } from '@/components/layout/DragDropOverlay';
import { UnlockScreen } from '@/features/auth/UnlockScreen';
import { SetupScreen } from '@/features/auth/SetupScreen';
import { SetupIdentityStep } from '@/features/auth/SetupIdentityStep';
import { sidebarItems, bottomTabItems } from '@/nav-items';
import { routes } from '@/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Onboarding step after wallet setup:
 * shows the identity creation UI with generated defaults.
 */
function OnboardingIdentityStep({ onDone }: { onDone: () => void }) {
  const { agent } = useAuth();
  const createIdentity = useCreateIdentity();
  const [isCreating, setIsCreating] = useState(false);

  // Use the agent DID as the seed for deterministic generation
  const seed = agent?.agentDid?.uri ?? 'default-seed';

  const handleCreate = useCallback(
    async (params: { displayName: string; avatar: Blob; hero: Blob }) => {
      setIsCreating(true);
      try {
        await createIdentity.mutateAsync({
          persona: params.displayName,
          displayName: params.displayName,
          avatar: params.avatar,
          hero: params.hero,
          dwnEndpoints: DEFAULT_DWN_ENDPOINTS,
        });
        onDone();
      } catch (err) {
        console.error('Failed to create identity:', err);
        setIsCreating(false);
      }
    },
    [createIdentity, onDone],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-4">
      <div className="w-full max-w-md">
        <SetupIdentityStep
          seed={seed}
          onCreateIdentity={handleCreate}
          onSkip={onDone}
          isLoading={isCreating}
        />
      </div>
    </div>
  );
}

/**
 * AuthGate — decides what to render based on auth state.
 *
 * Flow:
 * 1. Not initialized → Loader
 * 2. First time → SetupScreen (PIN) → OnboardingIdentityStep → App
 * 3. Returning user, locked → UnlockScreen → App
 * 4. Unlocked → App
 */
function AuthGate() {
  const { initialized, unlocked, firstTime, connect, unlock, error, isLoading } = useAuth();
  const setPhrase = useBackupSeedStore((s) => s.setPhrase);

  // Track whether we just finished first-time setup and need the identity step
  const [showIdentityStep, setShowIdentityStep] = useState(false);

  const handleSetup = useCallback(
    async (pin: string, dwnEndpoints: string[]) => {
      const recoveryPhrase = await connect(pin, dwnEndpoints);
      if (recoveryPhrase) {
        setPhrase(recoveryPhrase);
      }
      // After wallet connects, show the identity creation step
      setShowIdentityStep(true);
      return recoveryPhrase;
    },
    [connect, setPhrase],
  );

  const handleUnlock = useCallback(
    async (pin: string) => {
      await unlock(pin);
    },
    [unlock],
  );

  // Still initialising the AuthManager
  if (!initialized) {
    return <Loader message="Initialising wallet..." />;
  }

  // Wallet is locked — show setup or unlock screen
  if (!unlocked) {
    if (firstTime) {
      return (
        <SetupScreen
          onSetup={handleSetup}
          isLoading={isLoading}
          error={error}
        />
      );
    }
    return (
      <UnlockScreen
        onUnlock={handleUnlock}
        error={error}
        isLoading={isLoading}
      />
    );
  }

  // Just finished first-time setup — guided identity creation
  if (showIdentityStep) {
    return (
      <OnboardingIdentityStep onDone={() => setShowIdentityStep(false)} />
    );
  }

  // Wallet is unlocked — render the app
  return (
    <>
      <DragDropOverlay />
      <AppShell sidebarItems={sidebarItems} bottomTabItems={bottomTabItems}>
        <Suspense fallback={<Loader message="Loading..." />}>
          <Routes>
            {routes.map((route) => (
              <Route
                key={route.path ?? 'index'}
                index={route.index}
                path={route.path}
                element={route.element}
              />
            ))}
          </Routes>
        </Suspense>
      </AppShell>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <EnboxAuthProvider>
        <AuthGate />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface-2)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-default)',
            },
          }}
        />
      </EnboxAuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}
