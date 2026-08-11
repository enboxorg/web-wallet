import { useNavigate } from 'react-router';
import { Shield, KeyRound, ChevronRight } from 'lucide-react';
import { useAuth } from '@/enbox/hooks/use-auth';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/lib/utils';

/** Injected at build time by Vite's `define` in vite.config.ts. */
declare const __ENBOX_BROWSER_SDK_VERSION__: string;

const settingsLinks = [
  {
    path: '/settings/security',
    label: 'Security',
    description: 'PIN, auto-lock, and wallet security',
    icon: Shield,
  },
  {
    path: '/settings/backup',
    label: 'Backup & Recovery',
    description: 'Recovery phrase and profile export',
    icon: KeyRound,
  },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const { lock } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your wallet preferences." />

      <div className="space-y-2">
        {settingsLinks.map(({ path, label, description, icon: Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className={cn(
              'flex items-center gap-4 w-full rounded-lg p-4',
              'bg-surface-1 border border-border-default',
              'hover:bg-surface-2 hover:border-border-strong',
              'transition-colors duration-[var(--duration-fast)]',
              'text-left',
            )}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-accent/10">
              <Icon size={20} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary">{label}</div>
              <div className="text-xs text-text-tertiary">{description}</div>
            </div>
            <ChevronRight size={16} className="text-text-ghost shrink-0" />
          </button>
        ))}
      </div>

      <div className="pt-4">
        <Button variant="secondary" onClick={lock} className="w-full">
          Lock Wallet
        </Button>
      </div>

      <p className="pt-6 text-center text-[10px] text-text-ghost">
        SDK: @enbox/browser@{__ENBOX_BROWSER_SDK_VERSION__}
      </p>
    </div>
  );
}
