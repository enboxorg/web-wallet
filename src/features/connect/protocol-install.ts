import { authoredProtocolDefinitionsEqual } from '@enbox/dwn-sdk-js';

import {
  inspectConnectProtocol,
  type DwnProtocolDefinition,
  type EnboxPlatformAgent,
} from '@enbox/agent';

import { getCanonicalProtocolDefinition } from '@/lib/protocol-names';

export type ResolvedProtocolSetupStatus = 'configured' | 'conflict' | 'override' | 'install' | 'upgrade';
export type ProtocolSetupStatus = ResolvedProtocolSetupStatus | 'checking' | 'unavailable';

type ProtocolInspectionAgent = Pick<
  EnboxPlatformAgent,
  'dwn' | 'processDwnRequest'
>;

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

function isNormalizedProtocolUri(protocol: string): boolean {
  try {
    const url = new URL(protocol);
    url.search = '';
    url.hash = '';
    const normalized = url.href.endsWith('/') ? url.href.slice(0, -1) : url.href;
    return normalized === protocol;
  } catch {
    return false;
  }
}

export const protocolDefinitionsMatch = authoredProtocolDefinitionsEqual;

export function protocolHasEncryptedTypes(protocolDefinition: DwnProtocolDefinition): boolean {
  return Object.values(protocolDefinition.types ?? {}).some(
    (type) => (type as { encryptionRequired?: boolean }).encryptionRequired === true,
  );
}

function getRequestedProtocolDefinitionConflictMessage(
  requestedDefinition: DwnProtocolDefinition,
): string | undefined {
  if (!isNormalizedProtocolUri(requestedDefinition.protocol)) {
    return `Protocol URI '${requestedDefinition.protocol}' is not normalized.`;
  }
  if (containsWalletManagedKeyAgreement(requestedDefinition)) {
    return `Protocol '${requestedDefinition.protocol}' contains wallet-managed encryption keys. `
      + 'Requesters must provide the canonical protocol definition without $keyAgreement metadata.';
  }
  const canonicalDefinition = getCanonicalProtocolDefinition(requestedDefinition.protocol);
  if (canonicalDefinition && !protocolDefinitionsMatch(canonicalDefinition, requestedDefinition)) {
    return `Protocol '${requestedDefinition.protocol}' does not match the wallet's pinned canonical definition.`;
  }

  return undefined;
}

export function getRequestedProtocolDefinitionsConflictMessage(
  definitions: DwnProtocolDefinition[],
): string | undefined {
  const byProtocol = new Map<string, DwnProtocolDefinition>();

  for (const definition of definitions) {
    const unsafeDefinition = getRequestedProtocolDefinitionConflictMessage(definition);
    if (unsafeDefinition) return unsafeDefinition;

    const existing = byProtocol.get(definition.protocol);
    if (existing && !protocolDefinitionsMatch(existing, definition)) {
      return `The request includes different definitions for protocol '${definition.protocol}'.`;
    }
    byProtocol.set(definition.protocol, definition);
  }

  return undefined;
}

export async function queryProtocolSetupStatus(
  selectedDid: string,
  agent: ProtocolInspectionAgent,
  protocolDefinition: DwnProtocolDefinition,
): Promise<ResolvedProtocolSetupStatus> {
  if (getRequestedProtocolDefinitionConflictMessage(protocolDefinition) !== undefined) {
    return 'conflict';
  }

  const inspection = await inspectConnectProtocol({
    agent,
    ownerDid   : selectedDid,
    definition : protocolDefinition,
  });

  if (inspection.status !== 'conflict') {
    return inspection.status;
  }

  // Enbox treats every authored-definition mismatch as a conflict. The wallet
  // may offer an explicit owner override for a safe, non-canonical protocol;
  // canonical definitions and owner-key conflicts remain hard-blocked.
  const canonicalDefinition = getCanonicalProtocolDefinition(protocolDefinition.protocol);
  if (
    canonicalDefinition === undefined
    && inspection.installedDefinition !== undefined
    && !protocolDefinitionsMatch(inspection.installedDefinition, protocolDefinition)
  ) {
    return 'override';
  }

  return 'conflict';
}
