import { useEffect, useState, useCallback } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { PinInput } from '@/components/ui/PinInput';
import { SeedPhraseInput } from '@/components/ui/SeedPhraseInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { PIN_LENGTH } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import {
  canCheckPasskeySupport,
  isPasskeySupported,
  markPinAuthMethod,
  preparePasskeyVaultPassword,
  storePasskeyCredential,
  type WalletAuthMethod,
} from '@/lib/passkeys';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface RestoreWalletPageProps {
  onRestore: (phrase: string, pin: string, dwnEndpoints: string[]) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onBack?: () => void;
}

type Step = 'phrase' | 'security-method' | 'create-pin' | 'confirm-pin';
type PasskeySupport = 'checking' | 'supported' | 'unsupported';

const STEP_INDEX: Record<Step, number> = {
  'phrase': 0,
  'security-method': 1,
  'create-pin': 2,
  'confirm-pin': 3,
};

export function RestoreWalletPage({ onRestore, isLoading, error, onBack }: RestoreWalletPageProps) {
  const canCheckPasskey = canCheckPasskeySupport();
  const [step, setStep] = useState<Step>('phrase');
  const [passkeySupport, setPasskeySupport] = useState<PasskeySupport>(
    canCheckPasskey ? 'checking' : 'unsupported',
  );
  const [authMethod, setAuthMethod] = useState<WalletAuthMethod>(
    canCheckPasskey ? 'passkey' : 'pin',
  );
  const [phrase, setPhrase] = useState('');
  const [pin, setPin] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const passkeySupported = passkeySupport === 'supported';

  useEffect(() => {
    if (passkeySupport !== 'checking') return;
    let cancelled = false;
    isPasskeySupported().then((supported) => {
      if (cancelled) return;
      setPasskeySupport(supported ? 'supported' : 'unsupported');
      if (!supported) {
        setAuthMethod('pin');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [passkeySupport]);

  const handlePhraseSubmit = useCallback((value: string) => {
    setPhrase(value);
    setLocalError(null);
    setStep(passkeySupported ? 'security-method' : 'create-pin');
  }, [passkeySupported]);

  const handlePinCreated = useCallback((value: string) => {
    setAuthMethod('pin');
    setPin(value);
    setStep('confirm-pin');
  }, []);

  const handlePinConfirmed = useCallback(
    async (value: string) => {
      if (value !== pin) {
        setConfirmError('PINs do not match. Try again.');
        return;
      }
      setConfirmError(null);
      setLocalError(null);
      try {
        await onRestore(phrase, pin, DEFAULT_DWN_ENDPOINTS);
        markPinAuthMethod();
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to restore wallet');
      }
    },
    [pin, phrase, onRestore],
  );

  const handleUsePasskey = useCallback(async () => {
    setAuthMethod('passkey');
    setPin('');
    setConfirmError(null);
    setLocalError(null);
    setLocalLoading(true);
    try {
      const prepared = await preparePasskeyVaultPassword();
      await onRestore(phrase, prepared.password, DEFAULT_DWN_ENDPOINTS);
      storePasskeyCredential(prepared.credential);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to restore wallet');
    } finally {
      setLocalLoading(false);
    }
  }, [onRestore, phrase]);

  const handleUsePin = useCallback(() => {
    setAuthMethod('pin');
    setPin('');
    setConfirmError(null);
    setLocalError(null);
    setStep('create-pin');
  }, []);

  const handleBack = useCallback(() => {
    setConfirmError(null);
    setLocalError(null);
    if (step === 'phrase' && onBack) {
      onBack();
    } else if (step === 'security-method') {
      setStep('phrase');
    } else if (step === 'create-pin') {
      setPin('');
      setStep(passkeySupported ? 'security-method' : 'phrase');
    } else if (step === 'confirm-pin') {
      setPin('');
      setStep('create-pin');
    }
  }, [passkeySupported, step, onBack]);

  if (isLoading && !localLoading) {
    return <Loader message="Restoring your wallet..." />;
  }

  const progress = getStepProgress(step, authMethod, passkeySupported);
  const displayedError = localError ?? error;

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

        <StepIndicator current={progress.current} total={progress.total} />

        {step === 'phrase' && (
          <div className="flex flex-col items-center gap-6 w-full">
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-2xl font-semibold text-text-primary">
                Restore Wallet
              </h1>
              <p className="text-sm text-text-secondary text-center">
                Enter your recovery phrase to restore your wallet vault and recover
                identities synced to your configured DWNs.
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

        {step === 'security-method' && (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-semibold text-text-primary">
                Secure Wallet
              </h1>
              <p className="text-sm text-text-secondary">
                Choose how to unlock this restored wallet
              </p>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button
                onClick={handleUsePasskey}
                loading={localLoading || isLoading}
                disabled={localLoading || isLoading}
                className="w-full justify-start text-left"
                size="lg"
                autoFocus
              >
                <KeyRound className="h-5 w-5 shrink-0" />
                <span className="flex min-w-0 flex-col items-start">
                  <span>Use passkey</span>
                  <span className="text-xs font-normal opacity-80">
                    Recommended for this device
                  </span>
                </span>
              </Button>
              <Button
                variant="secondary"
                onClick={handleUsePin}
                disabled={localLoading || isLoading}
                className="w-full justify-start text-left"
                size="lg"
              >
                <ShieldCheck className="h-5 w-5 shrink-0" />
                <span className="flex min-w-0 flex-col items-start">
                  <span>Use PIN instead</span>
                  <span className="text-xs font-normal text-text-tertiary">
                    Enter a 4 digit PIN to unlock
                  </span>
                </span>
              </Button>
            </div>

            {displayedError && (
              <p className="text-sm text-error" role="alert">
                {displayedError}
              </p>
            )}

            <Button variant="ghost" onClick={handleBack} disabled={localLoading || isLoading}>
              Back
            </Button>
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

            {displayedError && (
              <p className="text-sm text-error" role="alert">
                {displayedError}
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

function getStepProgress(
  step: Step,
  authMethod: WalletAuthMethod,
  passkeySupported: boolean,
): { current: number; total: number } {
  if (!passkeySupported) {
    return { current: step === 'phrase' ? 0 : STEP_INDEX[step] - 1, total: 3 };
  }
  if (authMethod === 'passkey') {
    return { current: step === 'phrase' ? 0 : 1, total: 2 };
  }
  return { current: STEP_INDEX[step], total: 4 };
}
