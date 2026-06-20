import { useEffect, useState, useCallback } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { PinInput } from '@/components/ui/PinInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { PIN_LENGTH } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
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

export interface SetupScreenProps {
  onSetup: (pin: string, dwnEndpoints: string[]) => Promise<string | undefined>;
  isLoading: boolean;
  error: string | null;
  onSwitchToRestore?: () => void;
}

type Step = 'security-method' | 'create-pin' | 'confirm-pin' | 'endpoints';
type PasskeySupport = 'checking' | 'supported' | 'unsupported';

const STEP_INDEX: Record<Step, number> = {
  'security-method': 0,
  'create-pin': 1,
  'confirm-pin': 2,
  'endpoints': 3,
};

export function SetupScreen({ onSetup, isLoading, error, onSwitchToRestore }: SetupScreenProps) {
  const canCheckPasskey = canCheckPasskeySupport();
  const [step, setStep] = useState<Step>(canCheckPasskey ? 'security-method' : 'create-pin');
  const [passkeySupport, setPasskeySupport] = useState<PasskeySupport>(
    canCheckPasskey ? 'checking' : 'unsupported',
  );
  const [authMethod, setAuthMethod] = useState<WalletAuthMethod>(
    canCheckPasskey ? 'passkey' : 'pin',
  );
  const [pin, setPin] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [dwnEndpoints] = useState<string[]>(DEFAULT_DWN_ENDPOINTS);
  const passkeySupported = passkeySupport === 'supported';

  useEffect(() => {
    if (passkeySupport !== 'checking') return;
    let cancelled = false;
    isPasskeySupported().then((supported) => {
      if (cancelled) return;
      setPasskeySupport(supported ? 'supported' : 'unsupported');
      if (!supported) {
        setAuthMethod('pin');
        setStep('create-pin');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [passkeySupport]);

  const handlePinCreated = useCallback((value: string) => {
    setPin(value);
    setAuthMethod('pin');
    setStep('confirm-pin');
  }, []);

  const handlePinConfirmed = useCallback(
    (value: string) => {
      if (value !== pin) {
        setConfirmError('PINs do not match. Try again.');
        return;
      }
      setConfirmError(null);
      setStep('endpoints');
    },
    [pin],
  );

  const handleUsePasskey = useCallback(() => {
    setAuthMethod('passkey');
    setPin('');
    setConfirmError(null);
    setLocalError(null);
    setStep('endpoints');
  }, []);

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
    if (step === 'confirm-pin') {
      setPin('');
      setStep('create-pin');
    } else if (step === 'create-pin' && passkeySupported) {
      setPin('');
      setStep('security-method');
    } else if (step === 'endpoints') {
      setStep(authMethod === 'pin' ? 'confirm-pin' : 'security-method');
    }
  }, [authMethod, passkeySupported, step]);

  const handleSetup = useCallback(async () => {
    if (localLoading || isLoading) return;

    setLocalError(null);
    setLocalLoading(true);
    let password = pin;
    let passkeyCredential: Awaited<ReturnType<typeof preparePasskeyVaultPassword>>['credential'] | null = null;

    try {
      if (authMethod === 'passkey') {
        const prepared = await preparePasskeyVaultPassword();
        password = prepared.password;
        passkeyCredential = prepared.credential;
      }

      await onSetup(password, dwnEndpoints);

      if (passkeyCredential) {
        storePasskeyCredential(passkeyCredential);
      } else {
        markPinAuthMethod();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set up wallet';
      setLocalError(message);
      if (authMethod === 'passkey' && isPasskeyVaultUnsupportedError(err)) {
        setPasskeySupport('unsupported');
        setAuthMethod('pin');
        setPin('');
        setStep('create-pin');
      }
    } finally {
      setLocalLoading(false);
    }
  }, [authMethod, dwnEndpoints, isLoading, localLoading, onSetup, pin]);

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

        {passkeySupport === 'checking' ? (
          <Loader message="Checking security options..." />
        ) : (
          <>
            <StepIndicator current={progress.current} total={progress.total} />

            {step === 'security-method' && (
              <StepSecurityMethod
                onUsePasskey={handleUsePasskey}
                onUsePin={handleUsePin}
                error={displayedError}
              />
            )}

            {step === 'create-pin' && (
              <StepCreatePin
                onComplete={handlePinCreated}
                onBack={passkeySupported ? handleBack : undefined}
                error={localError}
              />
            )}

            {step === 'confirm-pin' && (
              <StepConfirmPin
                onComplete={handlePinConfirmed}
                onBack={handleBack}
                error={confirmError}
              />
            )}

            {step === 'endpoints' && (
              <StepEndpoints
                endpoints={dwnEndpoints}
                authMethod={authMethod}
                onBack={handleBack}
                onSetup={handleSetup}
                isLoading={isLoading || localLoading}
                error={displayedError}
              />
            )}
          </>
        )}

        {onSwitchToRestore && (
          <button
            type="button"
            onClick={onSwitchToRestore}
            className="text-sm text-text-tertiary hover:text-accent transition-colors"
          >
            Restore wallet from recovery phrase
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step sub-components                                                */
/* ------------------------------------------------------------------ */

function getStepProgress(
  step: Step,
  authMethod: WalletAuthMethod,
  passkeySupported: boolean,
): { current: number; total: number } {
  if (!passkeySupported) {
    return { current: STEP_INDEX[step] - 1, total: 3 };
  }
  if (authMethod === 'passkey') {
    return { current: step === 'endpoints' ? 1 : 0, total: 2 };
  }
  return { current: STEP_INDEX[step], total: 4 };
}

function StepSecurityMethod({
  onUsePasskey,
  onUsePin,
  error,
}: {
  onUsePasskey: () => void;
  onUsePin: () => void;
  error: string | null;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">
          Welcome to Enbox
        </h1>
        <p className="text-sm text-text-secondary">
          Choose how to unlock your wallet
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <Button onClick={onUsePasskey} className="w-full justify-start text-left" size="lg" autoFocus>
          <KeyRound className="h-5 w-5 shrink-0" />
          <span className="flex min-w-0 flex-col items-start">
            <span>Use passkey</span>
            <span className="text-xs font-normal opacity-80">
              Recommended for this device
            </span>
          </span>
        </Button>
        <Button variant="secondary" onClick={onUsePin} className="w-full justify-start text-left" size="lg">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          <span className="flex min-w-0 flex-col items-start">
            <span>Use PIN instead</span>
            <span className="text-xs font-normal text-text-tertiary">
              Enter a 4 digit PIN to unlock
            </span>
          </span>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function StepCreatePin({
  onComplete,
  onBack,
  error,
}: {
  onComplete: (pin: string) => void;
  onBack?: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold text-text-primary">
          Welcome to Enbox
        </h1>
        <p className="text-sm text-text-secondary">
          Create a PIN to secure your wallet
        </p>
      </div>

      <PinInput
        length={PIN_LENGTH}
        onComplete={onComplete}
        autoFocus
      />

      {error && (
        <p className="max-w-xs text-center text-sm text-error" role="alert">
          {error}
        </p>
      )}

      {onBack && (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  );
}

function StepConfirmPin({
  onComplete,
  onBack,
  error,
}: {
  onComplete: (pin: string) => void;
  onBack: () => void;
  error: string | null;
}) {
  return (
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
        onComplete={onComplete}
        error={!!error}
        autoFocus
      />

      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

function StepEndpoints({
  endpoints,
  authMethod,
  onBack,
  onSetup,
  isLoading,
  error,
}: {
  endpoints: string[];
  authMethod: WalletAuthMethod;
  onBack: () => void;
  onSetup: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}) {
  if (isLoading) {
    return <Loader message="Setting up your wallet..." />;
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold text-text-primary">
          DWN Endpoints
        </h1>
        <p className="text-sm text-text-secondary text-center">
          Your wallet will sync with these decentralised web nodes
        </p>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {endpoints.map((endpoint) => (
          <span
            key={endpoint}
            className="inline-flex items-center rounded-full bg-surface-2 px-3 py-1 text-xs text-text-secondary border border-border-default"
          >
            {endpoint.replace(/^https?:\/\//, '')}
          </span>
        ))}
      </div>

      {error && (
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button onClick={onSetup} loading={isLoading}>
          {authMethod === 'passkey' ? 'Create passkey and set up' : 'Set up'}
        </Button>
      </div>
    </div>
  );
}
