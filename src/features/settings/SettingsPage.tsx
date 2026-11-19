import { useNavigate } from 'react-router';
import { Shield, KeyRound, ChevronRight, Lock } from 'lucide-react';
import { useAuth } from '@/enbox/hooks/use-auth';
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

const rowClasses = cn(
  'group flex w-full items-center gap-4 px-4 py-4 text-left',
  'transition-colors duration-[var(--duration-base)] hover:bg-surface-2',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
);

export default function SettingsPage() {
  const navigate = useNavigate();
  const { lock } = useAuth();

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Settings" description="Manage your wallet preferences." />

      <ul className="surface-card divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border-default bg-surface-1">
        {settingsLinks.map(({ path, label, description, icon: Icon }) => (
          <li key={path}>
            <button type="button" onClick={() => navigate(path)} className={rowClasses}>
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/15">
                <Icon size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-text-primary">{label}</span>
                <span className="mt-0.5 block text-[13px] text-text-tertiary">{description}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-ghost transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="surface-card overflow-hidden rounded-2xl border border-border-default bg-surface-1">
        <button type="button" onClick={lock} className={rowClasses}>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-secondary">
            <Lock size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-text-primary">Lock Wallet</span>
            <span className="mt-0.5 block text-[13px] text-text-tertiary">Require your PIN or passkey to continue</span>
          </span>
        </button>
      </div>

      <p className="text-center font-mono text-[11px] text-text-ghost">
        SDK: @enbox/browser@{__ENBOX_BROWSER_SDK_VERSION__}
      </p>
    </div>
  );
}
