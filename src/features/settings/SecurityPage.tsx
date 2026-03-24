import { useCallback, useState } from 'react';
import { Lock, Clock, Shield } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/enbox/hooks/use-auth';
import { AUTO_LOCK_OPTIONS, AUTO_LOCK_STORAGE_KEY, getAutoLockTimeout } from '@/lib/constants';
import { cn } from '@/lib/utils';

export default function SecurityPage() {
  const { lock } = useAuth();

  const [autoLockMs, setAutoLockMs] = useState(getAutoLockTimeout);

  const handleAutoLockChange = useCallback((value: string) => {
    const ms = parseInt(value, 10);
    try { localStorage.setItem(AUTO_LOCK_STORAGE_KEY, String(ms)); } catch {}
    setAutoLockMs(ms);
    toast.success('Auto-lock timeout updated');
  }, []);

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
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Change PIN</h2>
        </div>
        <p className="text-sm text-text-secondary">
          PIN change is not yet available. This feature will be added in a future update.
        </p>
      </Card>

      {/* Auto-lock timeout */}
      <Card padding="lg">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-5 w-5 text-text-secondary" />
          <h2 className="text-lg font-medium text-text-primary">Auto-lock timeout</h2>
        </div>
        <p className="text-sm text-text-secondary mb-3">
          Automatically lock the wallet after a period of inactivity.
        </p>
        <div className="flex flex-wrap gap-2">
          {AUTO_LOCK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleAutoLockChange(String(opt.value))}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                autoLockMs === opt.value
                  ? 'bg-accent text-accent-text'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
