import { useState, useCallback, Fragment } from 'react';
import { PinInput } from '@/components/ui/PinInput';
import { Button } from '@/components/ui/Button';
import { Loader } from '@/components/ui/Loader';
import { PIN_LENGTH } from '@/lib/constants';
import { DEFAULT_DWN_ENDPOINTS } from '@/lib/dwn-endpoints';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface SetupScreenProps {
  onSetup: (pin: string, dwnEndpoints: string[]) => Promise<string | undefined>;
  isLoading: boolean;
  error: string | null;
  onSwitchToRestore?: () => void;
}

type Step = 'create-pin' | 'confirm-pin' | 'endpoints';

const STEP_INDEX: Record<Step, number> = {
  'create-pin': 0,
  'confirm-pin': 1,
  'endpoints': 2,
};

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <div className={cn(
              'h-px w-6',
              i <= current ? 'bg-accent' : 'bg-border-default',
            )} />
          )}
          <div className={cn(
            'h-2 w-2 rounded-full transition-colors',
            i === current ? 'bg-accent' : i < current ? 'bg-accent/50' : 'bg-border-default',
          )} />
        </Fragment>
      ))}
    </div>
  );
}

export function SetupScreen({ onSetup, isLoading, error, onSwitchToRestore }: SetupScreenProps) {
  const [step, setStep] = useState<Step>('create-pin');
  const [pin, setPin] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [dwnEndpoints] = useState<string[]>(DEFAULT_DWN_ENDPOINTS);

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
      setStep('endpoints');
    },
    [pin],
  );

  const handleBack = useCallback(() => {
    setConfirmError(null);
    if (step === 'confirm-pin') {
      setPin('');
      setStep('create-pin');
    } else if (step === 'endpoints') {
      setStep('confirm-pin');
    }
  }, [step]);

  const handleSetup = useCallback(() => {
    onSetup(pin, dwnEndpoints);
  }, [onSetup, pin, dwnEndpoints]);

  return (
    <div
      className={cn(
        'flex min-h-screen items-center justify-center bg-surface-0 px-4',
        'animate-[fadeIn_0.3s_ease-out]',
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <EnboxLogo size="lg" />

        <StepIndicator current={STEP_INDEX[step]} total={3} />

        {step === 'create-pin' && (
          <StepCreatePin onComplete={handlePinCreated} />
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
            onBack={handleBack}
            onSetup={handleSetup}
            isLoading={isLoading}
            error={error}
          />
        )}

        {onSwitchToRestore && (
          <button
            type="button"
            onClick={onSwitchToRestore}
            className="text-sm text-text-tertiary hover:text-accent transition-colors"
          >
            Restore from backup phrase
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step sub-components                                                */
/* ------------------------------------------------------------------ */

function StepCreatePin({ onComplete }: { onComplete: (pin: string) => void }) {
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
  onBack,
  onSetup,
  isLoading,
  error,
}: {
  endpoints: string[];
  onBack: () => void;
  onSetup: () => void;
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
          Set up
        </Button>
      </div>
    </div>
  );
}
