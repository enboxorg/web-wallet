import { useEffect, useMemo, useState } from 'react';
import type { ConnectPermissionRequest } from '@enbox/connect';

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
  overriddenProtocols: ReadonlySet<string> = new Set(),
): boolean {
  return [...new Set(permissions.map((permission) => permission.protocolDefinition.protocol))]
    .every((protocol) =>
      statuses[protocol] === 'configured'
      || statuses[protocol] === 'install'
      || statuses[protocol] === 'upgrade'
      // An 'override' conflict only clears approval once the owner has explicitly
      // opted into replacing the installed definition for that protocol.
      || (statuses[protocol] === 'override' && overriddenProtocols.has(protocol))
    );
}

/**
 * Protocol URIs whose setup resolved to an overridable definition conflict —
 * a non-canonical protocol installed with a different definition. These are the
 * protocols the owner may choose to reconfigure (replace) during approval.
 */
export function getOverridableProtocols(statuses: ProtocolSetupStatusMap): string[] {
  return Object.entries(statuses)
    .filter(([, status]) => status === 'override')
    .map(([protocol]) => protocol);
}

/**
 * The requested definitions to hand to the owner reconfigure: one per overridable
 * protocol (deduplicated — preflight guarantees a request carries a single
 * definition per protocol). Empty when nothing is overridable.
 */
export function getProtocolDefinitionsToOverride(
  permissions: ConnectPermissionRequest[],
  statuses: ProtocolSetupStatusMap,
): ConnectPermissionRequest['protocolDefinition'][] {
  const overridable = new Set(getOverridableProtocols(statuses));
  const byProtocol = new Map<string, ConnectPermissionRequest['protocolDefinition']>();
  for (const permission of permissions) {
    const definition = permission.protocolDefinition;
    if (overridable.has(definition.protocol) && !byProtocol.has(definition.protocol)) {
      byProtocol.set(definition.protocol, definition);
    }
  }
  return [...byProtocol.values()];
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
