import { AlertTriangle } from 'lucide-react';

import type { ConnectRefreshDetection } from '@/features/connect/connect-refresh';
import { ConsentOutcome } from './ConsentLayout';
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
    <ConsentOutcome
      tone="error"
      icon={<AlertTriangle />}
      title="Connection cannot be renewed"
      message={<p className="text-xs leading-relaxed">{refreshUnavailableMessage(props)}</p>}
    />
  );
}
