import { useState, useCallback } from 'react';
import { PinInput } from '@/components/ui/PinInput';
import { SeedPhraseInput } from '@/components/ui/SeedPhraseInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { PIN_LENGTH } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface RestoreWalletPageProps {
  onRestore: (phrase: string, pin: string, dwnEndpoints: string[]) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onBack?: () => void;
}

type Step = 'phrase' | 'create-pin' | 'confirm-pin';

const STEP_INDEX: Record<Step, number> = {
  'phrase': 0,
  'create-pin': 1,
  'confirm-pin': 2,
};

export function RestoreWalletPage({ onRestore, isLoading, error, onBack }: RestoreWalletPageProps) {
  const [step, setStep] = useState<Step>('phrase');
  const [phrase, setPhrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handlePhraseSubmit = useCallback((value: string) => {
    setPhrase(value);
    setStep('create-pin');
  }, []);

  const handlePinCreated = useCallback((value: string) => {
    setPin(value);
    setStep('confirm-pin');
  }, []);

  const handlePinConfirmed = useCallback(
    (value: string) => {
      if (value !== pin) {
        setConfirmError('PINs do not match. Try again.');
        return;
      }
      setConfirmError(null);
      onRestore(phrase, pin, DEFAULT_DWN_ENDPOINTS);
    },
    [pin, phrase, onRestore],
  );

  const handleBack = useCallback(() => {
    setConfirmError(null);
    if (step === 'phrase' && onBack) {
      onBack();
    } else if (step === 'create-pin') {
      setPin('');
      setStep('phrase');
    } else if (step === 'confirm-pin') {
      setPin('');
      setStep('create-pin');
    }
  }, [step, onBack]);

  if (isLoading) {
    return <Loader message="Restoring your wallet..." />;
  }

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

        <StepIndicator current={STEP_INDEX[step]} total={3} />

        {step === 'phrase' && (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-semibold text-text-primary">
                Restore Wallet
              </h1>
              <p className="text-sm text-text-secondary text-center">
                Enter your recovery phrase to restore your wallet vault.
                To restore identities, import them from a JSON backup after setup.
              </p>
            </div>

            <SeedPhraseInput onSubmit={handlePhraseSubmit} />

            {onBack && (
              <Button variant="ghost" onClick={onBack}>
                Back
              </Button>
            )}
          </div>
        )}

        {step === 'create-pin' && (
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-semibold text-text-primary">
                Create PIN
              </h1>
              <p className="text-sm text-text-secondary">
                Create a PIN to secure your restored wallet
              </p>
            </div>

            <PinInput
              length={PIN_LENGTH}
              onComplete={handlePinCreated}
              autoFocus
            />

            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          </div>
        )}

        {step === 'confirm-pin' && (
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-semibold text-text-primary">
                Confirm PIN
              </h1>
              <p className="text-sm text-text-secondary">
                Enter your PIN again to confirm
              </p>
            </div>

            <PinInput
              length={PIN_LENGTH}
              onComplete={handlePinConfirmed}
              error={!!confirmError}
              autoFocus
            />

            {confirmError && (
              <p className="text-sm text-error" role="alert">
                {confirmError}
              </p>
            )}

            {error && (
              <p className="text-sm text-error" role="alert">
                {error}
              </p>
            )}

            <Button variant="ghost" onClick={handleBack}>
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
