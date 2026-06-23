import { History } from 'lucide-react';
import type { PermissionSessionGroup } from '@/features/identities/tabs/permission-sessions';

interface ExistingConnectSessionsNoticeProps {
  sessions: PermissionSessionGroup[];
}

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 active session' : `${count} active sessions`;
}

export function ExistingConnectSessionsNotice({ sessions }: ExistingConnectSessionsNoticeProps) {
  if (sessions.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
      <History className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-amber-300">
          Existing app access
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-100/90">
          This app already has {sessionCountLabel(sessions.length)} for this identity.
          Approving creates a new 24-hour session with the requested permissions.
        </p>
      </div>
    </div>
  );
}
