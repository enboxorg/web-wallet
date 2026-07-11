/**
 * WelcomeScreen — one-tap wallet creation.
 *
 * The happy path is a single tap: "Create my wallet" runs the passkey
 * ceremony, derives a random vault password wrapped by the passkey,
 * and connects the vault. Devices without passkey support fall back
 * to a 4-digit PIN (create + confirm). DWN endpoints stay on sensible
 * defaults behind a "Network options" disclosure.
 *
 * Replaces the multi-step SetupScreen (security method → PIN → confirm
 * → endpoints) with a zero-decision default.
 */

import { useCallback, useState } from 'react';
import { ChevronDown, Fingerprint, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { PinInput } from '@/components/ui/PinInput';
import { Loader } from '@/components/ui/Loader';
import { DwnEndpointEditor } from '@/components/ui/DwnEndpointEditor';
import { PIN_LENGTH } from '@/lib/constants';
import {
  getConfiguredDwnEndpoints,
  getDwnEndpointValidationError,
} from '@/lib/dwn-endpoints';
import { markJustOnboarded } from '@/lib/auto-identity';
import {
  canCheckPasskeySupport,
  isPasskeySupported,
  isPasskeyVaultUnsupportedError,
  markPinAuthMethod,
  preparePasskeyVaultPassword,
  storePasskeyCredential,
} from '@/lib/passkeys';
import { EnboxLogo } from './EnboxLogo';
import { cn } from '@/lib/utils';

export interface WelcomeScreenProps {
  onSetup: (password: string, dwnEndpoints: string[]) => Promise<string | undefined>;
  isLoading: boolean;
  error: string | null;
  onSwitchToRestore?: () => void;
}

type Step = 'welcome' | 'pin-create' | 'pin-confirm';

export function WelcomeScreen({ onSetup, isLoading, error, onSwitchToRestore }: WelcomeScreenProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [pin, setPin] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [dwnEndpoints, setDwnEndpoints] = useState<string[]>(getConfiguredDwnEndpoints);

  const endpointsInvalid = getDwnEndpointValidationError(dwnEndpoints) !== null;

  const finishSetup = useCallback(
    async (password: string, viaPasskey: boolean) => {
      setStatusMessage('Creating your wallet...');
      markJustOnboarded();
      await onSetup(password, dwnEndpoints);
      if (!viaPasskey) {
        markPinAuthMethod();
      }
    },
    [onSetup, dwnEndpoints],
  );

  /** Happy path: one tap → passkey → vault. */
  const handleCreate = useCallback(async () => {
    if (busy || isLoading) return;
    setLocalError(null);
    setBusy(true);
    try {
      const passkeyOk = canCheckPasskeySupport() && (await isPasskeySupported());
      if (!passkeyOk) {
        setStep('pin-create');
        return;
      }

      const prepared = await preparePasskeyVaultPassword();
      await finishSetup(prepared.password, true);
      storePasskeyCredential(prepared.credential);
    } catch (err) {
      setStatusMessage(null);
      if (isPasskeyVaultUnsupportedError(err)) {
        // Passkey provider can't wrap the vault — fall back to PIN
        setStep('pin-create');
        return;
      }
      const message = err instanceof Error ? err.message : 'Failed to create wallet';
      // A cancelled passkey prompt isn't an error worth shouting about
      setLocalError(/cancelled/i.test(message) ? null : message);
    } finally {
      setBusy(false);
    }
  }, [busy, isLoading, finishSetup]);

  const handlePinCreated = useCallback((value: string) => {
    setPin(value);
    setConfirmError(null);
    setStep('pin-confirm');
  }, []);

  const handlePinConfirmed = useCallback(
    async (value: string) => {
      if (value !== pin) {
        setConfirmError('PINs do not match. Try again.');
        return;
      }
      setConfirmError(null);
      setBusy(true);
      try {
        await finishSetup(pin, false);
      } catch (err) {
        setStatusMessage(null);
        setLocalError(err instanceof Error ? err.message : 'Failed to create wallet');
        setStep('pin-create');
        setPin('');
      } finally {
        setBusy(false);
      }
    },
    [pin, finishSetup],
  );

  const displayedError = localError ?? error;
  const working = busy || isLoading;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-surface-0 px-4 py-10 animate-[fadeIn_0.3s_ease-out]"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <EnboxLogo size="lg" />

        {working && statusMessage ? (
          <Loader message={statusMessage} />
        ) : step === 'welcome' ? (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-semibold text-text-primary">
                Own your identity
              </h1>
              <p className="max-w-xs text-sm leading-relaxed text-text-secondary">
                One profile for all your apps, kept on your device.
                No email, no password — just you.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3">
              <Button
                onClick={handleCreate}
                loading={working}
                disabled={endpointsInvalid}
                size="lg"
                className="w-full"
                autoFocus
              >
                <Fingerprint className="h-5 w-5 shrink-0" />
                Create my wallet
              </Button>
              {onSwitchToRestore && (
                <Button variant="ghost" onClick={onSwitchToRestore} disabled={working} className="w-full">
                  I already have a wallet
                </Button>
              )}
            </div>

            {displayedError && (
              <p className="max-w-xs text-center text-sm text-error" role="alert">
                {displayedError}
              </p>
            )}

            {/* Advanced: DWN endpoint selection, collapsed by default */}
            <div className="w-full">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="mx-auto flex items-center gap-1 text-xs text-text-tertiary transition-colors hover:text-text-secondary"
                aria-expanded={showAdvanced}
              >
                Network options
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')}
                />
              </button>
              {showAdvanced && (
                <div className="mt-3 rounded-xl border border-border-default bg-surface-1 p-4 animate-[fadeIn_0.2s_ease-out]">
                  <p className="mb-3 text-xs leading-relaxed text-text-tertiary">
                    Your wallet syncs with these decentralised web nodes. DWN operators can observe
                    your DID and traffic metadata.
                  </p>
                  <DwnEndpointEditor endpoints={dwnEndpoints} onChange={setDwnEndpoints} />
                  {endpointsInvalid && (
                    <p className="mt-2 text-xs text-error" role="alert">
                      Fix the endpoint list to continue.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex items-center gap-2 text-accent">
                <ShieldCheck size={18} />
                <h1 className="text-2xl font-semibold text-text-primary">
                  {step === 'pin-create' ? 'Create a PIN' : 'Confirm your PIN'}
                </h1>
              </div>
              <p className="text-sm text-text-secondary">
                {step === 'pin-create'
                  ? 'Passkeys are unavailable here, so secure your wallet with a PIN instead.'
                  : 'Enter your PIN again to confirm.'}
              </p>
            </div>

            <PinInput
              key={step}
              length={PIN_LENGTH}
              onComplete={step === 'pin-create' ? handlePinCreated : handlePinConfirmed}
              error={step === 'pin-confirm' && !!confirmError}
              disabled={working}
              autoFocus
            />

            {(confirmError ?? displayedError) && (
              <p className="max-w-xs text-center text-sm text-error" role="alert">
                {confirmError ?? displayedError}
              </p>
            )}

            <Button
              variant="ghost"
              onClick={() => {
                setPin('');
                setConfirmError(null);
                setStep(step === 'pin-confirm' ? 'pin-create' : 'welcome');
              }}
              disabled={working}
            >
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
