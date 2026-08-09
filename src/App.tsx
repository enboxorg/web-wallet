import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster, toast } from 'sonner';

import { EnboxAuthProvider } from '@/enbox/provider';
import { useAuth } from '@/enbox/hooks/use-auth';
import { useIdentities } from '@/enbox/hooks/use-identities';
import { useIdentitySyncReconciliation } from '@/enbox/hooks/use-identity-sync-reconciliation';
import { useCreateIdentity } from '@/enbox/hooks/use-identity-mutations';
import { useRegistrationRepair } from '@/enbox/hooks/use-registration-repair';
import { useSyncQueryInvalidation } from '@/enbox/hooks/use-sync-query-invalidation';
import { useBackupSeedStore } from '@/stores/backup-seed-store';
import { queryKeys } from '@/enbox/queries/query-keys';
import {
  autoCreateIdentity,
  clearJustOnboarded,
  consumeJustOnboarded,
} from '@/lib/auto-identity';
import {
  hasStoredPasskeyCredential,
  isPasskeyUnlockAvailable,
  unlockWithStoredPasskey,
} from '@/lib/passkeys';

import { Loader } from '@/components/ui/Loader';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { AppShell } from '@/components/layout/AppShell';
import { DragDropOverlay } from '@/components/layout/DragDropOverlay';
import { UnlockScreen } from '@/features/auth/UnlockScreen';
import { WelcomeScreen } from '@/features/auth/WelcomeScreen';
import { SetupIdentityStep } from '@/features/auth/SetupIdentityStep';
import { RestoreWalletPage } from '@/features/auth/RestoreWalletPage';
import { sidebarItems, bottomTabItems } from '@/nav-items';
import { routes } from '@/routes';
import DWebConnectPage from '@/features/connect/DWebConnectPage';
import AppConnectPage from '@/features/connect/AppConnectPage';
import { hasActiveConnectDeepLink } from '@/features/connect/connect-deep-link';
import { EnboxLogo } from '@/features/auth/EnboxLogo';

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
 *
 * Fresh onboarding (the tab just created its vault) crafts the first
 * identity automatically — generated name, avatar, and banner — so the
 * happy path stays at a single tap. Returning users who deleted all
 * their identities get the interactive creation card instead.
 */
function FirstIdentityGate({ onDone }: { onDone: () => void }) {
  const { agent, dwnEndpoints } = useAuth();
  const createIdentity = useCreateIdentity();
  const [isCreating, setIsCreating] = useState(false);
  const [autoMode, setAutoMode] = useState(() => consumeJustOnboarded());
  const autoStartedRef = useRef(false);

  const seed = agent?.agentDid?.uri ?? 'default-seed';

  // Zero-click path: craft the identity silently right after onboarding.
  useEffect(() => {
    if (!autoMode || !agent || autoStartedRef.current) return;
    autoStartedRef.current = true;

    autoCreateIdentity(agent, dwnEndpoints)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.identities.all });
        onDone();
      })
      .catch((err) => {
        console.warn('Auto identity creation failed:', err);
        toast.error('We could not set up your profile automatically — create it below.');
        setAutoMode(false);
      })
      .finally(() => {
        clearJustOnboarded();
      });
  }, [autoMode, agent, dwnEndpoints, onDone]);

  const handleCreate = useCallback(
    async (params: { displayName: string; avatar: Blob; hero: Blob }) => {
      setIsCreating(true);
      try {
        await createIdentity.mutateAsync({
          persona: params.displayName,
          displayName: params.displayName,
          avatar: params.avatar,
          hero: params.hero,
          dwnEndpoints,
        });
        onDone();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to create profile');
        setIsCreating(false);
      }
    },
    [createIdentity, dwnEndpoints, onDone],
  );

  if (autoMode) {
    return <Loader message="Setting up your profile..." fullScreen />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-0 px-4 animate-[fadeIn_0.3s_ease-out]">
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

// Latched once a relay approval starts before onboarding. Creating the
// wallet inside the approval flips `firstTime` (and adds the profile)
// mid-ceremony, and if the gate re-branched on those store changes it
// would unmount the approval — killing the in-flight approve and
// orphaning the single-use request pointer (the exact "create wallet →
// profile screen → scanner" dead end). Cleared whenever the route leaves
// /connect/app (deny and Done both navigate home).
let relayCeremonyActive = false;

/**
 * AuthGate — decides what to render based on auth + identity state.
 *
 * Flow:
 * 1. Not initialized → Loader
 * 2. First time → WelcomeScreen (one-tap passkey setup, PIN fallback) or RestoreWalletPage
 * 3. Returning user, locked → UnlockScreen
 * 4. Unlocked, no identities → FirstIdentityGate (auto after onboarding)
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
  const [authUiError, setAuthUiError] = useState<string | null>(null);
  const [passkeyConfigured, setPasskeyConfigured] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeySupportChecked, setPasskeySupportChecked] = useState(true);

  // Only query identities when unlocked
  const { data: identities, isLoading: identitiesLoading } = useIdentities();
  useSyncQueryInvalidation(identities);
  useIdentitySyncReconciliation(identities);
  useRegistrationRepair();

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
      setAuthUiError(null);
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
      setAuthUiError(null);
      await unlock(pin);
    },
    [unlock],
  );

  const handlePasskeyUnlock = useCallback(async () => {
    setAuthUiError(null);
    try {
      const password = await unlockWithStoredPasskey();
      await unlock(password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Passkey unlock failed';
      setAuthUiError(message);
      throw err;
    }
  }, [unlock]);

  const handleRestore = useCallback(
    async (phrase: string, pin: string, dwnEndpoints?: string[]) => {
      setAuthUiError(null);
      await restore(phrase, pin, dwnEndpoints);
      setForgotPin(false);
      setShowRestore(false);
    },
    [restore],
  );

  useEffect(() => {
    if (unlocked || firstTime) {
      setPasskeyConfigured(false);
      setPasskeyAvailable(false);
      setPasskeySupportChecked(true);
      return;
    }

    const configured = hasStoredPasskeyCredential();
    setPasskeyConfigured(configured);
    if (!configured) {
      setPasskeyAvailable(false);
      setPasskeySupportChecked(true);
      return;
    }

    let cancelled = false;
    setPasskeySupportChecked(false);
    isPasskeyUnlockAvailable().then((supported) => {
      if (cancelled) return;
      setPasskeyAvailable(supported);
      setPasskeySupportChecked(true);
    });

    return () => {
      cancelled = true;
    };
  }, [firstTime, unlocked]);

  // Still initialising the AuthManager
  if (!initialized) {
    return <Loader message="Initialising wallet..." fullScreen />;
  }

  // DWeb Connect renders without the app shell when the wallet is
  // unlocked, or when there is no wallet yet — in which case the page
  // runs one-tap onboarding inline and lands on the connect request.
  // Returning-but-locked users still unlock first (the branch below).
  if (location.pathname === '/dweb-connect' && (unlocked || firstTime)) {
    return (
      <Suspense fallback={<Loader message="Loading..." />}>
        <DWebConnectPage />
      </Suspense>
    );
  }

  // Relay deep links (QR scans / dapp hand-offs) get the same treatment:
  // a fresh phone that scanned a dapp's code lands directly on the
  // approval screen and can create its wallet inline. Only bypass the
  // shell when a sealed request pointer actually arrived — boot priming
  // claims the URL fragment into a module session before React renders,
  // so the gate checks the session, not the (already scrubbed) fragment.
  // Plain visits to /connect/app keep the normal welcome/unlock flow.
  // Once the ceremony starts it stays latched until the route changes:
  // inline onboarding flips `firstTime` mid-flow and the approval must
  // keep rendering in this exact tree position (no unmount).
  if (location.pathname !== '/connect/app') {
    relayCeremonyActive = false;
  }
  if (
    location.pathname === '/connect/app'
    && (relayCeremonyActive || (firstTime && hasActiveConnectDeepLink()))
  ) {
    relayCeremonyActive = true;
    // A proper phone screen: brand pinned on top (stays visible however
    // far the permissions scroll), dynamic-viewport height so the mobile
    // browser chrome never hides the actions, safe-area padding for
    // notches and home indicators.
    return (
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 flex justify-center border-b border-border-subtle bg-surface-0/85 pb-3 backdrop-blur-md pt-[max(1.25rem,env(safe-area-inset-top))]">
          <EnboxLogo size="sm" />
        </header>
        <main className="flex flex-1 flex-col">
          <Suspense fallback={<Loader message="Loading..." />}>
            <AppConnectPage standalone />
          </Suspense>
        </main>
      </div>
    );
  }

  // Wallet is locked — show setup or unlock screen
  if (!unlocked) {
    if (forgotPin) {
      return (
        <RestoreWalletPage
          onRestore={handleRestore}
          isLoading={isLoading}
          error={authUiError ?? error}
          onBack={() => setForgotPin(false)}
          allowEndpointSelection={false}
        />
      );
    }
    if (firstTime) {
      if (showRestore) {
        return (
          <RestoreWalletPage
            onRestore={handleRestore}
            isLoading={isLoading}
            error={authUiError ?? error}
            onBack={() => setShowRestore(false)}
          />
        );
      }
      return (
        <WelcomeScreen
          onSetup={handleSetup}
          onSwitchToRestore={() => setShowRestore(true)}
          isLoading={isLoading}
          error={authUiError ?? error}
        />
      );
    }
    return (
      <UnlockScreen
        onUnlock={handleUnlock}
        onUnlockWithPasskey={handlePasskeyUnlock}
        onForgotPin={() => setForgotPin(true)}
        error={authUiError ?? error}
        isLoading={isLoading}
        passkeyConfigured={passkeyConfigured}
        passkeyAvailable={passkeyAvailable}
        passkeySupportChecked={passkeySupportChecked}
      />
    );
  }

  // Unlocked but still loading identity list — show loader briefly
  if (identitiesLoading) {
    return <Loader message="Loading your profiles..." fullScreen />;
  }

  // Unlocked with no identities — show full-screen identity creation
  // This covers both first-time onboarding AND returning users with
  // no identities (e.g. after deleting all, or after a restore that
  // didn't recover any).
  const hasIdentities = identities && identities.length > 0;
  if (!hasIdentities && !identitySkipped) {
    return (
      <FirstIdentityGate
        onDone={() => setIdentitySkipped(true)}
      />
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
