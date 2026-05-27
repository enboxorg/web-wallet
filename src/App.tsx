import { Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';

import { EnboxAuthProvider } from '@/enbox/provider';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useIdentitySyncReconciliation } from '@/enbox/hooks/use-identity-sync-reconciliation';
import { useCreateIdentity } from '@/enbox/hooks/use-identity-mutations';
import { useSyncQueryInvalidation } from '@/enbox/hooks/use-sync-query-invalidation';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';

import { Loader } from '@/components/ui/Loader';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { DragDropOverlay } from '@/components/layout/DragDropOverlay';
import { UnlockScreen } from '@/features/auth/UnlockScreen';
import { SetupScreen } from '@/features/auth/SetupScreen';
import { SetupIdentityStep } from '@/features/auth/SetupIdentityStep';
import { RestoreWalletPage } from '@/features/auth/RestoreWalletPage';
import { sidebarItems, bottomTabItems } from '@/nav-items';
import { routes } from '@/routes';
import DWebConnectPage from '@/features/connect/DWebConnectPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

/**
 * Shown when the wallet is unlocked but has no identities.
 * Covers both first-time onboarding and returning users who
 * deleted all their identities.
 */
function CreateFirstIdentity({ onDone }: { onDone: () => void }) {
  const { agent } = useAuth();
  const createIdentity = useCreateIdentity();
  const [isCreating, setIsCreating] = useState(false);

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
        toast.error(err instanceof Error ? err.message : 'Failed to create identity');
        setIsCreating(false);
      }
    },
    [createIdentity, onDone],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-4 animate-[fadeIn_0.3s_ease-out]">
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
 * AuthGate — decides what to render based on auth + identity state.
 *
 * Flow:
 * 1. Not initialized → Loader
 * 2. First time → SetupScreen (PIN) or RestoreWalletPage
 * 3. Returning user, locked → UnlockScreen
 * 4. Unlocked, no identities → CreateFirstIdentity (full-screen)
 * 5. Unlocked, has identities → App shell with routes
 */
function AuthGate() {
  const location = useLocation();
  const { initialized, unlocked, firstTime, connect, unlock, lock, restore, error, isLoading } = useAuth();
  const setPhrase = useBackupSeedStore((s) => s.setPhrase);
  const needsBackup = useBackupSeedStore((s) => !!s.phrase);

  // Keyboard shortcut: Cmd/Ctrl+L to lock wallet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        if (unlocked) lock();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [unlocked, lock]);

  const [showRestore, setShowRestore] = useState(false);
  const [forgotPin, setForgotPin] = useState(false);
  // Allow user to skip identity creation and go straight to the app
  const [identitySkipped, setIdentitySkipped] = useState(false);

  // Only query identities when unlocked
  const { data: identities, isLoading: identitiesLoading } = useIdentities();
  useSyncQueryInvalidation();
  useIdentitySyncReconciliation(identities);

  // Compute backup-needed badge for nav items (must be before early returns)
  const sidebarWithBadges = useMemo(() =>
    sidebarItems.map(item =>
      item.path === '/settings/backup' ? { ...item, badge: needsBackup } : item
    ), [needsBackup]);

  const bottomTabsWithBadges = useMemo(() =>
    bottomTabItems.map(item =>
      item.path === '/settings' ? { ...item, badge: needsBackup } : item
    ), [needsBackup]);

  const handleSetup = useCallback(
    async (pin: string, dwnEndpoints: string[]) => {
      const recoveryPhrase = await connect(pin, dwnEndpoints);
      if (recoveryPhrase) {
        setPhrase(recoveryPhrase);
      }
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

  const handleRestore = useCallback(
    async (phrase: string, pin: string, dwnEndpoints: string[]) => {
      await restore(phrase, pin, dwnEndpoints);
      setForgotPin(false);
      setShowRestore(false);
    },
    [restore],
  );

  // Still initialising the AuthManager
  if (!initialized) {
    return <Loader message="Initialising wallet..." fullScreen />;
  }

  // Wallet is locked — show setup or unlock screen
  if (!unlocked) {
    if (forgotPin) {
      return (
        <RestoreWalletPage
          onRestore={handleRestore}
          isLoading={isLoading}
          error={error}
          onBack={() => setForgotPin(false)}
        />
      );
    }
    if (firstTime) {
      if (showRestore) {
        return (
          <RestoreWalletPage
            onRestore={handleRestore}
            isLoading={isLoading}
            error={error}
            onBack={() => setShowRestore(false)}
          />
        );
      }
      return (
        <SetupScreen
          onSetup={handleSetup}
          onSwitchToRestore={() => setShowRestore(true)}
          isLoading={isLoading}
          error={error}
        />
      );
    }
    return (
      <UnlockScreen
        onUnlock={handleUnlock}
        onForgotPin={() => setForgotPin(true)}
        error={error}
        isLoading={isLoading}
      />
    );
  }

  // Unlocked but still loading identity list — show loader briefly
  if (identitiesLoading) {
    return <Loader message="Loading identities..." fullScreen />;
  }

  // Unlocked with no identities — show full-screen identity creation
  // This covers both first-time onboarding AND returning users with
  // no identities (e.g. after deleting all, or after a restore that
  // didn't recover any).
  const hasIdentities = identities && identities.length > 0;
  if (!hasIdentities && !identitySkipped) {
    return (
      <CreateFirstIdentity
        onDone={() => setIdentitySkipped(true)}
      />
    );
  }

  // DWeb Connect popup — render without the app shell (no sidebar/tabs)
  if (location.pathname === '/dweb-connect') {
    return (
      <Suspense fallback={<Loader message="Loading..." />}>
        <DWebConnectPage />
      </Suspense>
    );
  }

  // Wallet is unlocked with identities — render the app
  return (
    <>
      <DragDropOverlay />
      <AppShell sidebarItems={sidebarWithBadges} bottomTabItems={bottomTabsWithBadges}>
        <AnimatedRoutes />
      </AppShell>
    </>
  );
}

/** Renders routes with a fade-in animation on route changes. */
function AnimatedRoutes() {
  const location = useLocation();
  // Use first path segment as key so sub-routes don't re-trigger the animation
  const routeKey = location.pathname.split('/').slice(0, 2).join('/');

  return (
    <Suspense fallback={<Loader message="Loading..." />}>
      <div key={routeKey} className="animate-[fadeIn_0.2s_ease-out]">
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
      </div>
    </Suspense>
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
