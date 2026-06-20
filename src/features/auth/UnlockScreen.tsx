import { useCallback, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { PinInput } from '@/components/ui/PinInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { PIN_LENGTH } from '@/lib/constants';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface UnlockScreenProps {
  onUnlock: (pin: string) => void;
  onUnlockWithPasskey?: () => Promise<void>;
  onForgotPin?: () => void;
  error: string | null;
  isLoading: boolean;
  passkeyConfigured?: boolean;
  passkeyAvailable?: boolean;
  passkeySupportChecked?: boolean;
}

export function UnlockScreen({
  onUnlock,
  onUnlockWithPasskey,
  onForgotPin,
  error,
  isLoading,
  passkeyConfigured = false,
  passkeyAvailable = false,
  passkeySupportChecked = true,
}: UnlockScreenProps) {
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const busy = isLoading || passkeyLoading;

  const handleComplete = useCallback(
    (pin: string) => {
      if (!busy) {
        onUnlock(pin);
      }
    },
    [onUnlock, busy],
  );

  const handlePasskeyUnlock = useCallback(async () => {
    if (!onUnlockWithPasskey || busy) return;
    setPasskeyLoading(true);
    try {
      await onUnlockWithPasskey();
    } finally {
      setPasskeyLoading(false);
    }
  }, [busy, onUnlockWithPasskey]);

  const showPasskey = passkeyConfigured;
  const canUsePasskey = showPasskey && passkeyAvailable && onUnlockWithPasskey;

  const renderUnlockControl = () => {
    if (busy) {
      return <Loader message="Unlocking..." />;
    }

    if (showPasskey && !passkeySupportChecked) {
      return <Loader message="Checking passkey..." />;
    }

    if (canUsePasskey) {
      return (
        <div className="flex w-full flex-col items-center gap-4">
          <Button onClick={handlePasskeyUnlock} className="w-full" size="lg" autoFocus>
            <KeyRound className="h-5 w-5" />
            Unlock with passkey
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
    <div
      className={cn(
        'flex min-h-screen items-center justify-center bg-surface-0 px-4',
        'animate-[fadeIn_0.3s_ease-out]',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <EnboxLogo size="lg" />

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold text-text-primary">
            Unlock Wallet
          </h1>
          <p className="text-sm text-text-secondary">
            {subtitle}
          </p>
        </div>

        {renderUnlockControl()}

        {onForgotPin && (
          <button
            type="button"
            onClick={onForgotPin}
            className="mt-2 text-sm text-text-tertiary hover:text-accent transition-colors"
          >
            {restoreLabel}
          </button>
        )}
      </div>
    </div>
  );
}
