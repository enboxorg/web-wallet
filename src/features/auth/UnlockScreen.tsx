import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { PinInput } from '@/components/ui/PinInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { PIN_LENGTH } from '@/lib/constants';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { EnboxLogo } from './EnboxLogo';

export interface UnlockScreenProps {
  onUnlock: (pin: string) => Promise<void>;
  onUnlockWithPasskey?: (signal: AbortSignal) => Promise<void>;
  onForgotPin?: () => void;
  error: string | null;
  isLoading: boolean;
  isLocking?: boolean;
  passkeyConfigured?: boolean;
  passkeyAvailable?: boolean;
}

async function settleParentHandledUnlock(attempt: () => Promise<void>): Promise<void> {
  try {
    await attempt();
  } catch {
    // The parent owns the user-facing error. Event handlers still need to
    // settle rejected attempts so they never become unhandled promises.
  }
}

export function UnlockScreen({
  onUnlock,
  onUnlockWithPasskey,
  onForgotPin,
  error,
  isLoading,
  isLocking = false,
  passkeyConfigured = false,
  passkeyAvailable = false,
}: UnlockScreenProps) {
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeyAbortRef = useRef<AbortController | null>(null);
  const busy = isLocking || isLoading || passkeyLoading;

  useEffect(() => () => {
    const controller = passkeyAbortRef.current;
    passkeyAbortRef.current = null;
    controller?.abort();
  }, []);

  const handleComplete = useCallback(
    (pin: string) => {
      if (busy) return;
      void settleParentHandledUnlock(() => onUnlock(pin));
    },
    [onUnlock, busy],
  );

  const handlePasskeyUnlock = useCallback(async () => {
    if (!onUnlockWithPasskey || busy || passkeyAbortRef.current) return;

    const controller = new AbortController();
    passkeyAbortRef.current = controller;
    setPasskeyLoading(true);
    try {
      await settleParentHandledUnlock(() => onUnlockWithPasskey(controller.signal));
    } finally {
      if (passkeyAbortRef.current === controller) {
        passkeyAbortRef.current = null;
        setPasskeyLoading(false);
      }
    }
  }, [busy, onUnlockWithPasskey]);

  const handleCancelPasskeyUnlock = useCallback(() => {
    if (isLoading) return;
    passkeyAbortRef.current?.abort();
  }, [isLoading]);

  const showPasskey = passkeyConfigured;
  const canUsePasskey = showPasskey && passkeyAvailable && onUnlockWithPasskey;

  const renderUnlockControl = () => {
    if (isLocking) {
      return <Loader message="Locking wallet..." />;
    }

    if (isLoading) {
      return <Loader message={passkeyLoading ? 'Opening wallet...' : 'Unlocking...'} />;
    }

    if (passkeyLoading) {
      return (
        <div className="flex w-full flex-col items-center gap-4">
          <Loader message="Waiting for passkey approval..." />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCancelPasskeyUnlock}
          >
            Cancel passkey request
          </Button>
        </div>
      );
    }

    if (canUsePasskey) {
      return (
        <div className="flex w-full flex-col items-center gap-4">
          <Button onClick={handlePasskeyUnlock} className="w-full" size="lg" autoFocus>
            <KeyRound className="h-5 w-5" />
            Unlock using passkey
          </Button>

          {error && (
            <p className="text-sm text-error" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    }

    if (showPasskey) {
      return (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-error" role="alert">
            {error ?? 'This wallet uses a passkey, but passkeys are unavailable on this device or browser.'}
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-4">
        <PinInput
          length={PIN_LENGTH}
          onComplete={handleComplete}
          error={!!error}
          disabled={busy}
          autoFocus
        />

        {error && (
          <p className="text-sm text-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  };

  const subtitle = showPasskey
    ? 'Use your passkey to continue'
    : 'Enter your PIN to continue';

  const restoreLabel = showPasskey
    ? 'Passkey unavailable? Restore from recovery phrase'
    : 'Forgot PIN? Restore from recovery phrase';

  return (
    <AuthLayout>
      <div className="flex w-full flex-col items-center gap-9">
        <EnboxLogo halo />

        <div className="relative flex flex-col items-center gap-2 text-center">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-text-primary">
            Unlock your wallet
          </h1>
          <p className="text-[15px] text-text-secondary">
            {subtitle}
          </p>
        </div>

        <div className="relative flex w-full flex-col items-center">
          {renderUnlockControl()}
        </div>

        {onForgotPin && (
          <button
            type="button"
            onClick={onForgotPin}
            disabled={busy}
            className="relative min-h-9 rounded-lg px-3 text-sm text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {restoreLabel}
          </button>
        )}
      </div>
    </AuthLayout>
  );
}
