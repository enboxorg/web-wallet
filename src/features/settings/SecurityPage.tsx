import { useCallback, useState } from 'react';
import { Lock, Clock, KeySquare } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useAuth } from '@/enbox/hooks/use-auth';
import { AUTO_LOCK_OPTIONS, AUTO_LOCK_STORAGE_KEY, getAutoLockTimeout } from '@/lib/constants';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageSetEffect } from '@/lib/browser-effects';
import { hasStoredPasskeyCredential } from '@/lib/passkeys';
import { ChangePinDialog } from './ChangePinDialog';

function SettingIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-secondary [&>svg]:size-[18px]">
      {children}
    </span>
  );
}

export default function SecurityPage() {
  const { lock, changePin, verifyPin } = useAuth();
  // Passkey wallets unlock with the passkey and have no PIN to change.
  const [usesPin] = useState(() => !hasStoredPasskeyCredential());
  const [changePinOpen, setChangePinOpen] = useState(false);

  const [autoLockMs, setAutoLockMs] = useState(getAutoLockTimeout);

  const handleAutoLockChange = useCallback((value: string) => {
    const ms = parseInt(value, 10);
    runEnboxSync(localStorageSetEffect(AUTO_LOCK_STORAGE_KEY, String(ms)));
    setAutoLockMs(ms);
    toast.success('Auto-lock timeout updated');
  }, []);

  const handleLock = useCallback(() => {
    lock();
  }, [lock]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Security"
        description="Manage wallet security settings."
        backTo="/settings"
      />

      {/* Auto-lock timeout */}
      <Card>
        <div className="flex items-start gap-3">
          <SettingIcon><Clock /></SettingIcon>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary">Auto-lock timeout</h2>
            <p className="mt-0.5 text-sm text-text-tertiary">
              Automatically lock the wallet after a period of inactivity.
            </p>
          </div>
        </div>
        <SegmentedControl
          label="Auto-lock timeout"
          className="mt-4"
          options={AUTO_LOCK_OPTIONS}
          value={autoLockMs}
          onChange={(value) => handleAutoLockChange(String(value))}
        />
      </Card>

      {/* Lock wallet now */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <SettingIcon><Lock /></SettingIcon>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Lock wallet</h2>
              <p className="mt-0.5 text-sm text-text-tertiary">
                Lock right away. You'll need your PIN or passkey to get back in.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleLock} className="shrink-0">
            Lock now
          </Button>
        </div>
      </Card>

      {usesPin && (
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <SettingIcon><KeySquare /></SettingIcon>
              <div>
                <h2 className="text-base font-semibold text-text-primary">Change PIN</h2>
                <p className="mt-0.5 text-sm text-text-tertiary">
                  Pick a new PIN for unlocking this wallet. Your profiles and data stay as they are.
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setChangePinOpen(true)} className="shrink-0">
              Change PIN
            </Button>
          </div>
        </Card>
      )}

      <ChangePinDialog
        open={changePinOpen}
        onClose={() => setChangePinOpen(false)}
        verifyPin={verifyPin}
        changePin={changePin}
      />
    </div>
  );
}
