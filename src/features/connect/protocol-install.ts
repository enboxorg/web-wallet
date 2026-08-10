import {
  authoredProtocolDefinitionsEqual,
  type EncryptionKeyDeriver,
  KeyDerivationScheme,
} from '@enbox/dwn-sdk-js';

import {
  DwnInterface,
  type DwnProtocolDefinition,
  type EnboxPlatformAgent,
} from '@enbox/agent';
import { computeJwkThumbprint } from '@enbox/crypto';

import { getCanonicalProtocolDefinition } from '@/lib/protocol-names';

export type ResolvedProtocolSetupStatus = 'configured' | 'conflict' | 'override' | 'install' | 'upgrade';
export type ProtocolSetupStatus = ResolvedProtocolSetupStatus | 'checking' | 'unavailable';

type ProtocolConfigureEntry = {
  descriptor?: {
    definition?: DwnProtocolDefinition;
  };
};

type PrepareProtocolAgent = Pick<
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
  return Object.values(protocolDefinition.types ?? {}).some((type: any) => type?.encryptionRequired === true);
}

export function hasEncryptionConfiguredForEncryptedTypes(
  installedDefinition: DwnProtocolDefinition | undefined,
  requestedDefinition: DwnProtocolDefinition,
): boolean {
  if (!installedDefinition) return false;
  if (!protocolHasEncryptedTypes(requestedDefinition)) return true;
  if (!installedDefinition.$keyAgreement?.publicKeyJwk) return false;

  function structureHasRequiredKeys(
    requestedStructure: Record<string, any>,
    installedStructure: Record<string, any> | undefined,
  ): boolean {
    for (const [nodeName, requestedRuleSet] of Object.entries(requestedStructure)) {
      if (nodeName.startsWith('$')) continue;

      const installedRuleSet = installedStructure?.[nodeName];
      if (!installedRuleSet || typeof installedRuleSet !== 'object') return false;

      const isExternalReference = requestedRuleSet?.$ref !== undefined;
      if (!isExternalReference && !installedRuleSet.$keyAgreement?.publicKeyJwk) {
        return false;
      }

      if (!structureHasRequiredKeys(requestedRuleSet, installedRuleSet)) {
        return false;
      }
    }

    return true;
  }

  return structureHasRequiredKeys(
    requestedDefinition.structure as Record<string, any>,
    installedDefinition.structure as Record<string, any> | undefined,
  );
}

type EncryptionKeyState = 'configured' | 'conflict' | 'missing';

async function publicKeysMatch(left: unknown, right: unknown): Promise<boolean> {
  try {
    const [leftThumbprint, rightThumbprint] = await Promise.all([
      computeJwkThumbprint({ jwk: left as any }),
      computeJwkThumbprint({ jwk: right as any }),
    ]);
    return leftThumbprint === rightThumbprint;
  } catch {
    return false;
  }
}

async function getInstalledEncryptionKeyState(
  installedDefinition: DwnProtocolDefinition,
  requestedDefinition: DwnProtocolDefinition,
  keyDeriver: EncryptionKeyDeriver,
): Promise<EncryptionKeyState> {
  let missing = false;
  const basePath = [KeyDerivationScheme.ProtocolPath, requestedDefinition.protocol];
  const expectedRootKey = await keyDeriver.derivePublicKey(basePath);
  const installedRootKey = installedDefinition.$keyAgreement?.publicKeyJwk;
  if (installedRootKey === undefined) {
    missing = true;
  } else if (!await publicKeysMatch(installedRootKey, expectedRootKey)) {
    return 'conflict';
  }

  async function inspectStructure(
    requestedStructure: Record<string, any>,
    installedStructure: Record<string, any> | undefined,
    parentPath: string[],
  ): Promise<EncryptionKeyState> {
    for (const [nodeName, requestedRuleSet] of Object.entries(requestedStructure)) {
      if (nodeName.startsWith('$')) continue;

      const installedRuleSet = installedStructure?.[nodeName];
      if (!installedRuleSet || typeof installedRuleSet !== 'object') return 'missing';
      const currentPath = [...parentPath, nodeName];
      if (requestedRuleSet?.$ref === undefined) {
        const installedKey = installedRuleSet.$keyAgreement?.publicKeyJwk;
        if (installedKey === undefined) {
          missing = true;
        } else {
          const expectedKey = await keyDeriver.derivePublicKey(currentPath);
          if (!await publicKeysMatch(installedKey, expectedKey)) return 'conflict';
        }
      }

      const childState = await inspectStructure(requestedRuleSet, installedRuleSet, currentPath);
      if (childState === 'conflict') return 'conflict';
      if (childState === 'missing') missing = true;
    }
    return missing ? 'missing' : 'configured';
  }

  return inspectStructure(
    requestedDefinition.structure as Record<string, any>,
    installedDefinition.structure as Record<string, any> | undefined,
    basePath,
  );
}

async function getVerifiedProtocolSetupStatus(
  installedDefinition: DwnProtocolDefinition | undefined,
  requestedDefinition: DwnProtocolDefinition,
  selectedDid: string,
  agent: Pick<PrepareProtocolAgent, 'dwn'>,
): Promise<ResolvedProtocolSetupStatus> {
  const structuralStatus = getProtocolSetupStatus(installedDefinition, requestedDefinition);
  if (
    structuralStatus === 'conflict'
    || structuralStatus === 'override'
    || structuralStatus === 'install'
    || !protocolHasEncryptedTypes(requestedDefinition)
    || installedDefinition === undefined
  ) {
    // 'override' short-circuits alongside 'conflict': there is no point
    // inspecting the encryption keys of a definition the owner is about to
    // replace wholesale.
    return structuralStatus;
  }

  const keyDeriver = await agent.dwn.getEncryptionKeyDeriver(selectedDid);
  const keyState = await getInstalledEncryptionKeyState(
    installedDefinition,
    requestedDefinition,
    keyDeriver,
  );
  if (keyState === 'conflict') return 'conflict';
  return keyState === 'missing' ? 'upgrade' : 'configured';
}

export function getProtocolSetupStatus(
  installedDefinition: DwnProtocolDefinition | undefined,
  requestedDefinition: DwnProtocolDefinition,
): ResolvedProtocolSetupStatus {
  if (!isNormalizedProtocolUri(requestedDefinition.protocol)) {
    return 'conflict';
  }
  if (containsWalletManagedKeyAgreement(requestedDefinition)) {
    return 'conflict';
  }
  const canonicalDefinition = getCanonicalProtocolDefinition(requestedDefinition.protocol);
  if (canonicalDefinition && !protocolDefinitionsMatch(canonicalDefinition, requestedDefinition)) {
    return 'conflict';
  }

  if (!installedDefinition) {
    return 'install';
  }

  if (!protocolDefinitionsMatch(installedDefinition, requestedDefinition)) {
    // A non-canonical (custom app) protocol installed with a different
    // definition can be reconfigured by the owner on explicit override; a
    // canonical wallet-owned protocol stays hard-blocked — a connection request
    // must never replace it.
    return canonicalDefinition ? 'conflict' : 'override';
  }

  const missingEncryption = protocolHasEncryptedTypes(requestedDefinition)
    && !hasEncryptionConfiguredForEncryptedTypes(installedDefinition, requestedDefinition);
  if (missingEncryption) return 'upgrade';

  return 'configured';
}

export function getProtocolSetupConflictMessage(
  installedDefinition: DwnProtocolDefinition | undefined,
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

  if (!installedDefinition) {
    return undefined;
  }

  if (!protocolDefinitionsMatch(installedDefinition, requestedDefinition)) {
    return `Protocol '${requestedDefinition.protocol}' is already installed with a different definition. `
      + 'A connection request cannot replace an owner protocol definition.';
  }

  return undefined;
}

export function getRequestedProtocolDefinitionsConflictMessage(
  definitions: DwnProtocolDefinition[],
): string | undefined {
  const byProtocol = new Map<string, DwnProtocolDefinition>();

  for (const definition of definitions) {
    const unsafeDefinition = getProtocolSetupConflictMessage(undefined, definition);
    if (unsafeDefinition) return unsafeDefinition;

    const existing = byProtocol.get(definition.protocol);
    if (existing && !protocolDefinitionsMatch(existing, definition)) {
      return `The request includes different definitions for protocol '${definition.protocol}'.`;
    }
    byProtocol.set(definition.protocol, definition);
  }

  return undefined;
}

function getProtocolDefinitionFromEntry(
  entry: ProtocolConfigureEntry | undefined,
): DwnProtocolDefinition | undefined {
  return entry?.descriptor?.definition;
}

export async function queryProtocolSetupStatus(
  selectedDid: string,
  agent: Pick<PrepareProtocolAgent, 'dwn' | 'processDwnRequest'>,
  protocolDefinition: DwnProtocolDefinition,
): Promise<ResolvedProtocolSetupStatus> {
  const queryResult = await agent.processDwnRequest({
    author        : selectedDid,
    messageType   : DwnInterface.ProtocolsQuery,
    target        : selectedDid,
    messageParams : { filter: { protocol: protocolDefinition.protocol } },
  });

  if (queryResult.reply.status.code !== 200) {
    throw new Error(`Could not fetch protocol: ${queryResult.reply.status.detail}`);
  }

  return getVerifiedProtocolSetupStatus(
    getProtocolDefinitionFromEntry(queryResult.reply.entries?.[0]),
    protocolDefinition,
    selectedDid,
    agent,
  );
}
