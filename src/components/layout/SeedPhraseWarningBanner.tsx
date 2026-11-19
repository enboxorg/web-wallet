import { useLocation, useNavigate } from 'react-router';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useBackupSeedStore } from '@/stores/backup-seed-store';

/**
 * A persistent warning banner shown when the recovery phrase has not
 * been backed up. Clicking it navigates to the Backup page.
 *
 * Renders nothing if the phrase is already backed up, or on the Backup page
 * itself, where it would only repeat the page.
 */
export function SeedPhraseWarningBanner() {
  const phrase = useBackupSeedStore((s) => s.phrase);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  if (!phrase || pathname.startsWith('/settings/backup')) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/settings/backup')}
      className={
        'group mb-6 flex w-full items-center gap-3 rounded-2xl py-2.5 pl-3 pr-3.5'
        + ' border border-warning/25 bg-warning/[0.07]'
        + ' text-left text-sm'
        + ' transition-[background-color,border-color] duration-[var(--duration-base)] hover:border-warning/40 hover:bg-warning/[0.11]'
        + ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning'
      }
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
        <ShieldAlert size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold text-text-primary">Back up your wallet</span>
        <span className="hidden text-text-secondary sm:inline"> — save your recovery phrase so you can get back in if you lose this device.</span>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-warning">
        Back up
        <ArrowRight size={14} className="transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}
