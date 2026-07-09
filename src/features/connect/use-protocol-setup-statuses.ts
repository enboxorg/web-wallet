import { useEffect, useMemo, useState } from 'react';
import type { ConnectPermissionRequest } from '@enbox/agent';

import {
  getProtocolSetupStatus,
  protocolDefinitionsMatch,
  queryProtocolSetupStatus,
  type ProtocolSetupStatus,
} from './protocol-install';

type ProtocolSetupAgent = Parameters<typeof queryProtocolSetupStatus>[1];

export type ProtocolSetupStatusMap = Record<string, ProtocolSetupStatus>;

function collectProtocolDefinitions(permissions: ConnectPermissionRequest[]) {
  const byProtocol = new Map<string, ConnectPermissionRequest['protocolDefinition']>();
  const conflicts = new Set<string>();

  for (const permission of permissions) {
    const definition = permission.protocolDefinition;
    const existing = byProtocol.get(definition.protocol);
    if (existing && !protocolDefinitionsMatch(existing, definition)) {
      conflicts.add(definition.protocol);
    } else {
      byProtocol.set(definition.protocol, definition);
    }
  }

  for (const definition of byProtocol.values()) {
    if (getProtocolSetupStatus(undefined, definition) === 'conflict') {
      conflicts.add(definition.protocol);
    }
  }

  return { definitions: [...byProtocol.values()], conflicts };
}

export function protocolSetupAllowsApproval(
  permissions: ConnectPermissionRequest[],
  statuses: ProtocolSetupStatusMap,
): boolean {
  return [...new Set(permissions.map((permission) => permission.protocolDefinition.protocol))]
    .every((protocol) =>
      statuses[protocol] === 'configured'
      || statuses[protocol] === 'install'
      || statuses[protocol] === 'upgrade'
    );
}

export function useProtocolSetupStatuses(
  selectedDid: string,
  agent: ProtocolSetupAgent,
  permissions: ConnectPermissionRequest[],
  retryKey = 0,
): ProtocolSetupStatusMap {
  const collectedProtocols = useMemo(() =>
    collectProtocolDefinitions(permissions),
  [permissions]);
  const { definitions: protocolDefinitions, conflicts } = collectedProtocols;
  const statusKey = useMemo(() => JSON.stringify([
    selectedDid,
    protocolDefinitions,
    [...conflicts].sort(),
  ]), [conflicts, protocolDefinitions, selectedDid]);
  const pendingStatuses = useMemo(() => Object.fromEntries(
    protocolDefinitions.map((definition) => [
      definition.protocol,
      conflicts.has(definition.protocol) ? 'conflict' as const : 'checking' as const,
    ]),
  ), [conflicts, protocolDefinitions]);
  const [resolved, setResolved] = useState<{
    key: string;
    statuses: ProtocolSetupStatusMap;
  }>({ key: '', statuses: {} });

  useEffect(() => {
    if (!selectedDid || protocolDefinitions.length === 0) {
      setResolved({ key: statusKey, statuses: {} });
      return;
    }

    let cancelled = false;
    setResolved({ key: statusKey, statuses: pendingStatuses });

    void Promise.all(
      protocolDefinitions
        .filter((definition) => !conflicts.has(definition.protocol))
        .map(async (definition) => {
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
        setResolved({
          key: statusKey,
          statuses: { ...pendingStatuses, ...Object.fromEntries(entries) },
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [agent, conflicts, pendingStatuses, protocolDefinitions, retryKey, selectedDid, statusKey]);

  if (!selectedDid || protocolDefinitions.length === 0) return {};
  return resolved.key === statusKey ? resolved.statuses : pendingStatuses;
}
