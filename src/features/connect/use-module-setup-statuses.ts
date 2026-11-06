import { useEffect, useMemo, useState } from 'react';
import type { ConnectPermissionRequest } from '@enbox/connect';

import { withPromiseTimeout } from '@/lib/promise-timeout';
import {
  getRequestedModuleDefinitionsConflictMessage,
  moduleDefinitionsMatch,
  queryModuleSetupStatus,
  type ModuleSetupStatus,
} from './module-install';

type ModuleSetupAgent = Parameters<typeof queryModuleSetupStatus>[1];

const MODULE_SETUP_CHECK_TIMEOUT_MS = 10_000;

export type ModuleSetupStatusMap = Record<string, ModuleSetupStatus>;

function collectModuleDefinitions(permissions: ConnectPermissionRequest[]) {
  const byModule = new Map<string, ConnectPermissionRequest['moduleDefinition']>();
  const conflicts = new Set<string>();
  const usedUris = new Set(permissions.flatMap(permission => Object.values(permission.moduleDefinition.uses ?? {})));
  const grantedUris = new Set(permissions.filter(permission => permission.permissionScopes.length > 0)
    .map(permission => permission.moduleDefinition.module));
  const inferredProviderUris = new Set(permissions.filter(permission => permission.permissionScopes.length === 0
    && usedUris.has(permission.moduleDefinition.module) && !grantedUris.has(permission.moduleDefinition.module))
    .map(permission => permission.moduleDefinition.module));

  for (const permission of permissions) {
    const definition = permission.moduleDefinition;
    if (getRequestedModuleDefinitionsConflictMessage([definition]) !== undefined) {
      conflicts.add(definition.module);
    }

    const existing = byModule.get(definition.module);
    if (existing && !moduleDefinitionsMatch(existing, definition)) {
      conflicts.add(definition.module);
    } else if (existing === undefined) {
      byModule.set(definition.module, definition);
    }
  }

  return { definitions: [...byModule.values()], conflicts, inferredProviderUris };
}

export function moduleSetupAllowsApproval(
  permissions: ConnectPermissionRequest[],
  statuses: ModuleSetupStatusMap,
  overriddenModules: ReadonlySet<string> = new Set(),
): boolean {
  return [...new Set(permissions.map((permission) => permission.moduleDefinition.module))]
    .every((module) =>
      statuses[module] === 'configured'
      || statuses[module] === 'install'
      || statuses[module] === 'upgrade'
      // An 'override' conflict only clears approval once the owner has explicitly
      // opted into replacing the installed definition for that module.
      || (statuses[module] === 'override' && overriddenModules.has(module))
    );
}

/**
 * Module URIs whose setup resolved to an overridable definition conflict —
 * a non-canonical module installed with a different definition. These are the
 * modules the owner may choose to reconfigure (replace) during approval.
 */
export function getOverridableModules(statuses: ModuleSetupStatusMap): string[] {
  return Object.entries(statuses)
    .filter(([, status]) => status === 'override')
    .map(([module]) => module);
}

export function useModuleSetupStatuses(
  selectedDid: string,
  agent: ModuleSetupAgent,
  permissions: ConnectPermissionRequest[],
  retryKey = 0,
): ModuleSetupStatusMap {
  const collectedModules = useMemo(() =>
    collectModuleDefinitions(permissions),
  [permissions]);
  const { definitions: moduleDefinitions, conflicts, inferredProviderUris } = collectedModules;
  const statusKey = useMemo(() => JSON.stringify([
    selectedDid,
    moduleDefinitions,
    [...conflicts].sort(),
    [...inferredProviderUris].sort(),
  ]), [conflicts, inferredProviderUris, moduleDefinitions, selectedDid]);
  const pendingStatuses = useMemo(() => Object.fromEntries(
    moduleDefinitions.map((definition) => [
      definition.module,
      conflicts.has(definition.module) ? 'conflict' as const : 'checking' as const,
    ]),
  ), [conflicts, moduleDefinitions]);
  const [resolved, setResolved] = useState<{
    key: string;
    statuses: ModuleSetupStatusMap;
  }>({ key: '', statuses: {} });

  useEffect(() => {
    if (!selectedDid || moduleDefinitions.length === 0) {
      setResolved({ key: statusKey, statuses: {} });
      return;
    }

    let cancelled = false;
    setResolved({ key: statusKey, statuses: pendingStatuses });

    void Promise.all(
      moduleDefinitions
        .filter((definition) => !conflicts.has(definition.module))
        .map(async (definition) => {
          try {
            const status = await withPromiseTimeout(
              () => queryModuleSetupStatus(selectedDid, agent, definition, {
                reuseInstalledDefinition: inferredProviderUris.has(definition.module),
              }),
              MODULE_SETUP_CHECK_TIMEOUT_MS,
              () => new Error('Module setup check timed out.'),
            );
            return [definition.module, status] as const;
          } catch (err) {
            console.warn(`Could not check module setup for ${definition.module}:`, err);
            return [definition.module, 'unavailable' as const] as const;
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
  }, [agent, conflicts, inferredProviderUris, pendingStatuses, moduleDefinitions, retryKey, selectedDid, statusKey]);

  if (!selectedDid || moduleDefinitions.length === 0) return {};
  return resolved.key === statusKey ? resolved.statuses : pendingStatuses;
}
