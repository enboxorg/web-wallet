import { useEffect, useMemo, useState } from 'react';
import type { ConnectPermissionRequest } from '@enbox/agent';

import {
  queryProtocolSetupStatus,
  type ProtocolSetupStatus,
} from './protocol-install';

type ProtocolSetupAgent = Parameters<typeof queryProtocolSetupStatus>[1];

export type ProtocolSetupStatusMap = Record<string, ProtocolSetupStatus>;

function collectProtocolDefinitions(permissions: ConnectPermissionRequest[]) {
  const byProtocol = new Map<string, ConnectPermissionRequest['protocolDefinition']>();

  for (const permission of permissions) {
    byProtocol.set(permission.protocolDefinition.protocol, permission.protocolDefinition);
  }

  return [...byProtocol.values()];
}

export function useProtocolSetupStatuses(
  selectedDid: string,
  agent: ProtocolSetupAgent,
  permissions: ConnectPermissionRequest[],
): ProtocolSetupStatusMap {
  const protocolDefinitions = useMemo(() =>
    collectProtocolDefinitions(permissions),
  [permissions]);
  const [statuses, setStatuses] = useState<ProtocolSetupStatusMap>({});

  useEffect(() => {
    if (!selectedDid || protocolDefinitions.length === 0) {
      setStatuses({});
      return;
    }

    let cancelled = false;
    setStatuses(Object.fromEntries(
      protocolDefinitions.map((definition) => [definition.protocol, 'checking' as const]),
    ));

    void Promise.all(
      protocolDefinitions.map(async (definition) => {
        try {
          const status = await queryProtocolSetupStatus(selectedDid, agent, definition);
          return [definition.protocol, status] as const;
        } catch (err) {
          console.warn(`Could not check protocol setup for ${definition.protocol}:`, err);
          return [definition.protocol, 'unavailable' as const] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) {
        setStatuses(Object.fromEntries(entries));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agent, selectedDid, protocolDefinitions]);

  return statuses;
}
