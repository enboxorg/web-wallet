import { authoredModuleDefinitionsEqual } from '@enbox/dwn-sdk-js';

import {
  inspectConnectModule,
  type DwnModuleDefinition,
  type InspectConnectModuleParams,
} from '@enbox/agent';

import { getCanonicalModuleDefinition } from '@/lib/module-names';

export type ResolvedModuleSetupStatus = 'configured' | 'conflict' | 'override' | 'install' | 'upgrade';
export type ModuleSetupStatus = ResolvedModuleSetupStatus | 'checking' | 'unavailable';

type ModuleInspectionAgent = InspectConnectModuleParams['agent'];

function containsWalletManagedKeyAgreement(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsWalletManagedKeyAgreement);
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    key === '$keyAgreement'
    || key === '$encryption'
    || containsWalletManagedKeyAgreement(entry)
  );
}

function isNormalizedModuleUri(module: string): boolean {
  try {
    const url = new URL(module);
    url.search = '';
    url.hash = '';
    const normalized = url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
    return normalized === module;
  } catch {
    return false;
  }
}

export const moduleDefinitionsMatch = authoredModuleDefinitionsEqual;

function getRequestedModuleDefinitionConflictMessage(
  requestedDefinition: DwnModuleDefinition,
): string | undefined {
  if (!isNormalizedModuleUri(requestedDefinition.module)) {
    return `Module URI '${requestedDefinition.module}' is not normalized.`;
  }
  if (containsWalletManagedKeyAgreement(requestedDefinition)) {
    return `Module '${requestedDefinition.module}' contains wallet-managed encryption keys. `
      + 'Requesters must provide the canonical module definition without $keyAgreement metadata.';
  }
  const canonicalDefinition = getCanonicalModuleDefinition(requestedDefinition.module);
  if (canonicalDefinition && !moduleDefinitionsMatch(canonicalDefinition, requestedDefinition)) {
    return `Module '${requestedDefinition.module}' does not match the wallet's pinned canonical definition.`;
  }

  return undefined;
}

export function getRequestedModuleDefinitionsConflictMessage(
  definitions: DwnModuleDefinition[],
): string | undefined {
  const byModule = new Map<string, DwnModuleDefinition>();

  for (const definition of definitions) {
    const unsafeDefinition = getRequestedModuleDefinitionConflictMessage(definition);
    if (unsafeDefinition) return unsafeDefinition;

    const existing = byModule.get(definition.module);
    if (existing && !moduleDefinitionsMatch(existing, definition)) {
      return `The request includes different definitions for module '${definition.module}'.`;
    }
    byModule.set(definition.module, definition);
  }

  return undefined;
}

export async function queryModuleSetupStatus(
  selectedDid: string,
  agent: ModuleInspectionAgent,
  moduleDefinition: DwnModuleDefinition,
  options: { reuseInstalledDefinition?: boolean } = {},
): Promise<ResolvedModuleSetupStatus> {
  if (getRequestedModuleDefinitionConflictMessage(moduleDefinition) !== undefined) {
    return 'conflict';
  }

  let inspection = await inspectConnectModule({
    agent,
    ownerDid   : selectedDid,
    definition : moduleDefinition,
  });

  // Installation-only dependencies reuse the owner's selected policy. The
  // approval ceremony validates its imported contracts before any mutation.
  // Re-inspect that policy so missing or foreign owner keys still fail closed.
  if (options.reuseInstalledDefinition === true
    && inspection.installedDefinition !== undefined
    && !moduleDefinitionsMatch(inspection.installedDefinition, moduleDefinition)
    && getCanonicalModuleDefinition(moduleDefinition.module) === undefined) {
    inspection = await inspectConnectModule({
      agent,
      ownerDid: selectedDid,
      definition: JSON.parse(JSON.stringify(inspection.installedDefinition, (key, value) =>
        key === '$keyAgreement' || key === '$encryption' ? undefined : value
      )) as DwnModuleDefinition,
    });
    return inspection.status;
  }

  if (inspection.status !== 'conflict') {
    return inspection.status;
  }

  // The agent owns the safety classification for authored-definition
  // replacement. The wallet additionally pins its canonical modules, which
  // a connection request may never replace.
  if (
    inspection.definitionOverrideEligible === true
    && getCanonicalModuleDefinition(moduleDefinition.module) === undefined
  ) {
    return 'override';
  }

  return 'conflict';
}
