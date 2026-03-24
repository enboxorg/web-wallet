import { useCallback } from 'react';
import { PinInput } from '@/components/ui/PinInput';
import { Loader } from '@/components/ui/Loader';
import { PIN_LENGTH } from '@/lib/constants';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface UnlockScreenProps {
  onUnlock: (pin: string) => void;
  onForgotPin?: () => void;
  error: string | null;
  isLoading: boolean;
}

export function UnlockScreen({ onUnlock, onForgotPin, error, isLoading }: UnlockScreenProps) {
  const handleComplete = useCallback(
    (pin: string) => {
      if (!isLoading) {
        onUnlock(pin);
      }
    },
    [onUnlock, isLoading],
  );

  return (
    <div
      className={cn(
        'flex min-h-screen items-center justify-center bg-surface-0 px-4',
        'animate-[fadeIn_0.3s_ease-out]',
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <EnboxLogo size="lg" />

        <div className="flex flex-col items-center gap-2">
          <h1 className="text-2xl font-semibold text-text-primary">
            Unlock Wallet
          </h1>
          <p className="text-sm text-text-secondary">
            Enter your PIN to continue
          </p>
        </div>

        {isLoading ? (
          <Loader message="Unlocking..." />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <PinInput
              length={PIN_LENGTH}
              onComplete={handleComplete}
              error={!!error}
              disabled={isLoading}
              autoFocus
            />

            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {onForgotPin && (
          <button
            type="button"
            onClick={onForgotPin}
            className="mt-2 text-sm text-text-tertiary hover:text-accent transition-colors"
          >
            Forgot PIN? Restore from recovery phrase
          </button>
        )}
      </div>
    </div>
  );
}
