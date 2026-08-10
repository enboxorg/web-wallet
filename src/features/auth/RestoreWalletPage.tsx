import { useEffect, useState, useCallback } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { DwnEndpointEditor } from '@/components/ui/DwnEndpointEditor';
import { PinInput } from '@/components/ui/PinInput';
import { SeedPhraseInput } from '@/components/ui/SeedPhraseInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { PIN_LENGTH } from '@/lib/constants';
import {
  getConfiguredDwnEndpoints,
  getDwnEndpointValidationError,
} from '@/lib/dwn-endpoints';
import {
  canCheckPasskeySupport,
  isPasskeySupported,
  isPasskeyVaultUnsupportedError,
  markPinAuthMethod,
  preparePasskeyVaultPassword,
  storePasskeyCredential,
  type WalletAuthMethod,
} from '@/lib/passkeys';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface RestoreWalletPageProps {
  onRestore: (phrase: string, pin: string, dwnEndpoints?: string[]) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  onBack?: () => void;
  allowEndpointSelection?: boolean;
}

type Step = 'phrase' | 'endpoints' | 'security-method' | 'create-pin' | 'confirm-pin';
type PasskeySupport = 'checking' | 'supported' | 'unsupported';

export function RestoreWalletPage({
  onRestore,
  isLoading,
  error,
  onBack,
  allowEndpointSelection = true,
}: RestoreWalletPageProps) {
  const canCheckPasskey = canCheckPasskeySupport();
  const [step, setStep] = useState<Step>('phrase');
  const [passkeySupport, setPasskeySupport] = useState<PasskeySupport>(
    canCheckPasskey ? 'checking' : 'unsupported',
  );
  const [authMethod, setAuthMethod] = useState<WalletAuthMethod>(
    canCheckPasskey ? 'passkey' : 'pin',
  );
  const [phrase, setPhrase] = useState('');
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>(getConfiguredDwnEndpoints);
  const [isEndpointOverrideEnabled, setIsEndpointOverrideEnabled] = useState(false);
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
    setStep(allowEndpointSelection
      ? 'endpoints'
      : passkeySupported ? 'security-method' : 'create-pin');
  }, [allowEndpointSelection, passkeySupported]);

  const handleEndpointsContinue = useCallback(() => {
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
        await onRestore(
          phrase,
          pin,
          isEndpointOverrideEnabled ? dwnEndpoints : undefined,
        );
        markPinAuthMethod();
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Failed to restore wallet');
      }
    },
    [dwnEndpoints, isEndpointOverrideEnabled, pin, phrase, onRestore],
  );

  const handleUsePasskey = useCallback(async () => {
    setAuthMethod('passkey');
    setPin('');
    setConfirmError(null);
    setLocalError(null);
    setLocalLoading(true);
    try {
      const prepared = await preparePasskeyVaultPassword();
      await onRestore(
        phrase,
        prepared.password,
        isEndpointOverrideEnabled ? dwnEndpoints : undefined,
      );
      storePasskeyCredential(prepared.credential);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore wallet';
      setLocalError(message);
      if (isPasskeyVaultUnsupportedError(err)) {
        setPasskeySupport('unsupported');
        setAuthMethod('pin');
        setPin('');
        setStep('create-pin');
      }
    } finally {
      setLocalLoading(false);
    }
  }, [dwnEndpoints, isEndpointOverrideEnabled, onRestore, phrase]);

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
    } else if (step === 'endpoints') {
      setStep('phrase');
    } else if (step === 'security-method') {
      setStep(allowEndpointSelection ? 'endpoints' : 'phrase');
    } else if (step === 'create-pin') {
      setPin('');
      setStep(passkeySupported
        ? 'security-method'
        : allowEndpointSelection ? 'endpoints' : 'phrase');
    } else if (step === 'confirm-pin') {
      setPin('');
      setStep('create-pin');
    }
  }, [allowEndpointSelection, passkeySupported, step, onBack]);

  if (isLoading && !localLoading) {
    return <Loader message="Restoring your wallet..." />;
  }

  const progress = getStepProgress(step, authMethod, passkeySupported, allowEndpointSelection);
  const displayedError = localError ?? error;

  return (
    <div
      className={cn(
        'flex min-h-dvh items-center justify-center bg-surface-0 px-4',
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
                profiles synced to your network.
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

        {step === 'endpoints' && (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-semibold text-text-primary">
                Recovery DWN Endpoints
              </h1>
              <p className="text-sm text-text-secondary">
                By default, recovery uses the endpoints in your signed vault DID document.
              </p>
            </div>

            {isEndpointOverrideEnabled ? (
              <div className="flex w-full flex-col gap-3">
                <p className="text-sm text-text-secondary">
                  These endpoints will deliberately replace the endpoints discovered during recovery.
                </p>
                <DwnEndpointEditor endpoints={dwnEndpoints} onChange={setDwnEndpoints} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEndpointOverrideEnabled(false)}
                  className="self-start"
                >
                  Use endpoints from DID document
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEndpointOverrideEnabled(true)}
              >
                Enter replacement endpoints
              </Button>
            )}

            <div className="flex gap-3">
              <Button variant="ghost" onClick={handleBack}>
                Back
              </Button>
              <Button
                onClick={handleEndpointsContinue}
                disabled={isEndpointOverrideEnabled
                  && getDwnEndpointValidationError(dwnEndpoints) !== null}
              >
                Continue
              </Button>
            </div>
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

            {localError && (
              <p className="max-w-xs text-center text-sm text-error" role="alert">
                {localError}
              </p>
            )}

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
  allowEndpointSelection: boolean,
): { current: number; total: number } {
  const prefix: Step[] = allowEndpointSelection ? ['phrase', 'endpoints'] : ['phrase'];
  let visibleSteps: Step[];
  if (!passkeySupported) {
    visibleSteps = [...prefix, 'create-pin', 'confirm-pin'];
  } else if (authMethod === 'passkey') {
    visibleSteps = [...prefix, 'security-method'];
  } else {
    visibleSteps = [...prefix, 'security-method', 'create-pin', 'confirm-pin'];
  }
  return {
    current: Math.max(0, visibleSteps.indexOf(step)),
    total: visibleSteps.length,
  };
}
