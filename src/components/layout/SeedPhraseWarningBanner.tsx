import { useNavigate } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { useBackupSeedStore } from '@/stores/backup-seed-store';

/**
 * A persistent warning banner shown when the recovery phrase has not
 * been backed up. Clicking it navigates to the Backup page.
 *
 * Renders nothing if the phrase is already backed up.
 */
export function SeedPhraseWarningBanner() {
  const phrase = useBackupSeedStore((s) => s.phrase);
  const navigate = useNavigate();

  if (!phrase) return null;

  return (
    <button
      type="button"
      onClick={() => navigate('/settings/backup')}
      className={
        'flex items-center gap-3 w-full rounded-lg px-4 py-3 mb-4'
        + ' bg-warning/10 border border-warning/25'
        + ' text-left text-sm text-warning'
        + ' hover:bg-warning/15 transition-colors duration-[var(--duration-fast)]'
      }
    >
      <ShieldAlert size={18} className="shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="font-medium">Back up your wallet</span>
        <span className="hidden sm:inline text-warning/70"> — export your identities to keep your DIDs and data safe.</span>
      </div>
      <span className="text-xs text-warning/60 shrink-0">Back up</span>
    </button>
  );
}
