import { useLocation, useNavigate } from 'react-router';
import { ShieldAlert } from 'lucide-react';
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
        'group flex items-center gap-3 w-full rounded-lg px-4 py-3 mb-4'
        + ' bg-warning/10 border border-warning/25'
        + ' text-left text-sm text-warning'
        + ' hover:bg-warning/15 transition-colors duration-[var(--duration-fast)]'
      }
    >
      <ShieldAlert size={18} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">Back up your wallet</span>
        <span className="hidden sm:inline"> — save your recovery phrase so you can get back in if you lose this device.</span>
      </div>
      <span className="shrink-0 text-xs font-medium underline-offset-2 group-hover:underline">Back up</span>
    </button>
  );
}
