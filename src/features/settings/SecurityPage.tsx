import { useState, useCallback } from 'react';
import { Lock, Clock, Shield } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PinInput } from '@/components/ui/PinInput';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/enbox/hooks/use-auth';
import { PIN_LENGTH, INACTIVITY_TIMEOUT_MS } from '@/lib/constants';

export default function SecurityPage() {
  const { lock } = useAuth();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const autoLockMinutes = Math.round(INACTIVITY_TIMEOUT_MS / 60_000);

  const handleChangePin = useCallback(async () => {
    setPinError(null);

    if (currentPin.length !== PIN_LENGTH) {
      setPinError('Please enter your current PIN');
      return;
    }
    if (newPin.length !== PIN_LENGTH) {
      setPinError('Please enter a new PIN');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PINs do not match');
      return;
    }
    if (newPin === currentPin) {
      setPinError('New PIN must be different from current PIN');
      return;
    }

    setIsChanging(true);
    // TODO: implement PIN change via AuthManager
    console.log('TODO: implement PIN change');
    toast.info('PIN change coming soon');
    setIsChanging(false);
  }, [currentPin, newPin, confirmPin]);

  const handleLock = useCallback(() => {
    lock();
  }, [lock]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        description="Manage wallet security settings."
        backTo="/settings"
      />

      {/* Change PIN */}
      <Card padding="lg" className="space-y-5">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Change PIN</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Current PIN
            </label>
            <PinInput
              length={PIN_LENGTH}
              onComplete={setCurrentPin}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              New PIN
            </label>
            <PinInput
              length={PIN_LENGTH}
              onComplete={setNewPin}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Confirm new PIN
            </label>
            <PinInput
              length={PIN_LENGTH}
              onComplete={setConfirmPin}
            />
          </div>

          {pinError && (
            <p className="text-sm text-error">{pinError}</p>
          )}

          <Button onClick={handleChangePin} loading={isChanging}>
            Change PIN
          </Button>
        </div>
      </Card>

      {/* Auto-lock timeout */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">
            Auto-lock timeout
          </h2>
        </div>
        <p className="text-sm text-text-secondary">
          Your wallet automatically locks after{' '}
          <span className="font-medium text-text-primary">
            {autoLockMinutes} minutes
          </span>{' '}
          of inactivity.
        </p>
      </Card>

      {/* Lock wallet now */}
      <Card padding="lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-text-secondary" />
            <div>
              <h2 className="text-lg font-medium text-text-primary">
                Lock wallet
              </h2>
              <p className="text-sm text-text-secondary">
                Immediately lock your wallet and require PIN to re-enter.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleLock}>
            Lock now
          </Button>
        </div>
      </Card>
    </div>
  );
}
