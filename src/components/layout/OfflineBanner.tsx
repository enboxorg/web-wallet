import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

import { useSyncConnectivity } from '@/enbox/hooks/use-sync-connectivity';

export function OfflineBanner() {
  const [browserOffline, setBrowserOffline] = useState(!navigator.onLine);
  const syncConnectivity = useSyncConnectivity();

  useEffect(() => {
    const goOffline = () => setBrowserOffline(true);
    const goOnline = () => setBrowserOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Browser connectivity takes precedence; if the browser is online but the sync
  // engine still can't reach the DWN, surface that instead of staying silent.
  const syncOffline = !browserOffline && syncConnectivity === 'offline';

  if (!browserOffline && !syncOffline) return null;

  return (
    <div className="relative z-10 flex items-center justify-center gap-2 border-b border-warning/25 bg-warning/10 px-4 py-2 text-xs font-medium text-warning">
      <WifiOff size={14} className="shrink-0" aria-hidden="true" />
      <span>
        {browserOffline
          ? "You're offline. Changes will sync when you reconnect."
          : "Can't reach the sync server. Your changes are saved and will sync once it's reachable."}
      </span>
    </div>
  );
}
