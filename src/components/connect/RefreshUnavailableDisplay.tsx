import { AlertTriangle } from 'lucide-react';

import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';
import { refreshUnavailableMessage } from './refresh-unavailable';

interface RefreshUnavailableDisplayProps {
  appName: string;
  detection: ConnectRefreshDetection;
  lookupError: boolean;
  ownerSupported: boolean;
}

/**
 * Shown instead of the approval screen when a refresh request cannot map to
 * a renewable session in this wallet. The only action offered is closing.
 */
export function RefreshUnavailableDisplay(props: RefreshUnavailableDisplayProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-10 w-10 text-error" />
      <p className="text-sm font-medium text-text-primary">
        Connection cannot be renewed
      </p>
      <p className="max-w-xs text-xs leading-relaxed text-text-secondary">
        {refreshUnavailableMessage(props)}
      </p>
    </div>
  );
}
