/**
 * DWeb Connect context — buffers postMessage requests from dapps.
 *
 * This context sits ABOVE the AgentProvider (auth gate) so it mounts
 * immediately when the popup opens, before the user enters their PIN.
 * It sends `dweb-connect-loaded` right away and buffers any incoming
 * `dweb-connect-authorization-request` until the DWebConnect page
 * component mounts (after unlock) and consumes it.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ConnectPermissionRequest } from '@enbox/agent';

export interface DWebConnectRequest {
  origin: string;
  did?: string;
  permissions: ConnectPermissionRequest[];
}

interface DWebConnectContextValue {
  /** The buffered authorization request, if one has been received. */
  pendingRequest: DWebConnectRequest | null;
  /** Clear the pending request after it's been consumed. */
  clearRequest: () => void;
  /** Whether this window was opened as a DWeb Connect popup. */
  isPopup: boolean;
}

const DWebConnectContext = createContext<DWebConnectContextValue>({
  pendingRequest : null,
  clearRequest   : () => {},
  isPopup        : false,
});

export const useDWebConnect = () => useContext(DWebConnectContext);

export const DWebConnectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequest, setPendingRequest] = useState<DWebConnectRequest | null>(null);
  const isPopup = !!window.opener;
  const sentLoaded = useRef(false);

  useEffect(() => {
    // Only set up the listener if this is a popup opened by a dapp.
    if (!isPopup) return;

    const handleMessage = (e: MessageEvent) => {
      const { type } = e.data ?? {};

      if (type === 'dweb-connect-authorization-request') {
        const { did, permissions } = e.data;
        setPendingRequest({
          origin      : e.origin,
          did,
          permissions : permissions ?? [],
        });
      }
    };

    window.addEventListener('message', handleMessage);

    // Signal to the dapp that the wallet popup is ready.
    // The dapp will respond with dweb-connect-authorization-request.
    if (!sentLoaded.current) {
      sentLoaded.current = true;
      window.opener?.postMessage({ type: 'dweb-connect-loaded' }, '*');
    }

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [isPopup]);

  const clearRequest = () => setPendingRequest(null);

  return (
    <DWebConnectContext.Provider value={{ pendingRequest, clearRequest, isPopup }}>
      {children}
    </DWebConnectContext.Provider>
  );
};
