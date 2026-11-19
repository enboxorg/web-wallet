import { useCallback, useState } from 'react';
import { Lock, Clock, Shield } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/enbox/hooks/use-auth';
import { AUTO_LOCK_OPTIONS, AUTO_LOCK_STORAGE_KEY, getAutoLockTimeout } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { runEnboxSync } from '@/enbox/effect/runtime';
import { localStorageSetEffect } from '@/lib/browser-effects';

function SettingIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-secondary [&>svg]:size-[18px]">
      {children}
    </span>
  );
}

export default function SecurityPage() {
  const { lock } = useAuth();

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
    <div className="mx-auto max-w-2xl space-y-6">
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
        <div
          role="radiogroup"
          aria-label="Auto-lock timeout"
          className="mt-4 flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1"
        >
          {AUTO_LOCK_OPTIONS.map((opt) => {
            const selected = autoLockMs === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => handleAutoLockChange(String(opt.value))}
                className={cn(
                  'min-h-9 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11',
                  selected
                    ? 'bg-surface-0 text-text-primary shadow-sm ring-1 ring-border-default'
                    : 'text-text-tertiary hover:text-text-primary',
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Lock wallet now */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <SettingIcon><Lock /></SettingIcon>
            <div>
              <h2 className="text-base font-semibold text-text-primary">Lock wallet</h2>
              <p className="mt-0.5 text-sm text-text-tertiary">
                Immediately lock your wallet and require PIN to re-enter.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={handleLock} className="shrink-0">
            Lock now
          </Button>
        </div>
      </Card>

      {/* Change PIN */}
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <SettingIcon><Shield /></SettingIcon>
          <div>
            <h2 className="text-base font-semibold text-text-primary">Change PIN</h2>
            <p className="mt-0.5 text-sm text-text-tertiary">
              PIN change is not yet available. This feature will be added in a future update.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
