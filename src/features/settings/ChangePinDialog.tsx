import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Loader } from '@/components/ui/Loader';
import { PinInput } from '@/components/ui/PinInput';
import { IncorrectPinError } from '@/lib/auth-errors';
import { PIN_LENGTH } from '@/lib/constants';

type Step = 'current' | 'new' | 'confirm' | 'saving';

const STEP_COPY: Record<Exclude<Step, 'saving'>, { title: string; description: string }> = {
  current : { title: 'Enter your current PIN', description: 'Confirm it’s you before choosing a new PIN.' },
  new     : { title: 'Choose a new PIN', description: `Pick ${PIN_LENGTH} digits you haven’t used for this wallet.` },
  confirm : { title: 'Enter your new PIN again', description: 'Make sure it’s the one you meant.' },
};

interface ChangePinDialogProps {
  open: boolean;
  onClose: () => void;
  verifyPin: (pin: string) => boolean | null;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
}

/**
 * Current PIN → new PIN → confirm. The current PIN is checked before moving
 * on, so a typo is caught on the first step rather than after the new PIN.
 */
export function ChangePinDialog({ open, onClose, verifyPin, changePin }: ChangePinDialogProps) {
  const [step, setStep] = useState<Step>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Bumped to remount the PIN boxes, clearing them for another try.
  const [attempt, setAttempt] = useState(0);

  function reset() {
    setStep('current');
    setCurrentPin('');
    setNewPin('');
    setError(null);
    setAttempt((value) => value + 1);
  }

  function close() {
    if (step === 'saving') return;
    reset();
    onClose();
  }

  function retry(nextStep: Exclude<Step, 'saving'>, message: string) {
    setStep(nextStep);
    setError(message);
    setAttempt((value) => value + 1);
  }

  async function handleComplete(pin: string) {
    if (step === 'current') {
      const verified = verifyPin(pin);
      if (verified === false) return retry('current', 'That PIN isn’t right. Try again.');
      if (verified === null) {
        return retry('current', 'Couldn’t confirm your current PIN. Lock and unlock your wallet, then try again.');
      }
      setCurrentPin(pin);
      setError(null);
      setStep('new');
      return;
    }

    if (step === 'new') {
      if (pin === currentPin) return retry('new', 'That’s your current PIN. Choose a different one.');
      setNewPin(pin);
      setError(null);
      setStep('confirm');
      return;
    }

    if (step === 'confirm') {
      if (pin !== newPin) return retry('new', 'The PINs didn’t match. Choose your new PIN again.');
      setStep('saving');
      try {
        await changePin(currentPin, pin);
        toast.success('PIN changed. Use your new PIN next time you unlock.');
        reset();
        onClose();
      } catch (err) {
        if (err instanceof IncorrectPinError) return retry('current', err.message);
        retry('new', err instanceof Error ? err.message : 'Couldn’t change your PIN. Try again.');
      }
    }
  }

  return (
    <Dialog open={open} onClose={close} title="Change PIN">
      {step === 'saving' ? (
        <div className="py-6">
          <Loader message="Updating your PIN…" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 py-2 text-center">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">{STEP_COPY[step].title}</h3>
            <p className="text-sm text-text-tertiary">{STEP_COPY[step].description}</p>
          </div>
          <PinInput
            key={`${step}-${attempt}`}
            length={PIN_LENGTH}
            onComplete={(pin) => { void handleComplete(pin); }}
            error={error !== null}
            autoFocus
          />
          <p role="alert" className="min-h-5 text-sm text-error">{error}</p>
          <Button variant="ghost" size="sm" onClick={close}>Cancel</Button>
        </div>
      )}
    </Dialog>
  );
}
