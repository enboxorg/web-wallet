import type { AudienceKeyDeliveryOutcome, AudienceKeyDeliveryStatus } from '@enbox/agent';

import { Enbox } from '@enbox/api';
import { getRoleAudienceContextId } from '@enbox/dwn-sdk-js';

import type { EnboxAgent } from './types';

const ROLE_QUERY_PAGE_SIZE = 100;

type ProtocolRuleSetLike = {
  $keyAgreement?: { publicKeyJwk?: unknown };
  $role?: boolean;
  [key: string]: unknown;
};

type ProtocolDefinitionLike = {
  protocol: string;
  structure: Record<string, ProtocolRuleSetLike>;
};

type RoleRecordLike = {
  contextId?: string;
  recipient?: string;
};

export type AudienceKeyDeliveryEntry = {
  key: string;
  ownerDid: string;
  protocol: string;
  rolePath: string;
  recipientDid: string;
  contextId?: string;
  granteeDid?: string;
  status: AudienceKeyDeliveryStatus;
};

type AudienceTuple = Omit<AudienceKeyDeliveryEntry, 'key' | 'status'> & {
  audienceContextId: string;
};

function deliverableRolePaths(definition: ProtocolDefinitionLike): string[] {
  const paths: string[] = [];

  function visit(structure: Record<string, ProtocolRuleSetLike>, parentPath: string): void {
    for (const [name, node] of Object.entries(structure)) {
      if (name.startsWith('$') || typeof node !== 'object' || node === null) {
        continue;
      }

      const path = parentPath ? `${parentPath}/${name}` : name;
      if (node.$role === true && node.$keyAgreement?.publicKeyJwk !== undefined) {
        paths.push(path);
      }
      visit(node as Record<string, ProtocolRuleSetLike>, path);
    }
  }

  visit(definition.structure, '');
  return paths;
}

function tupleKey(tuple: AudienceTuple): string {
  return JSON.stringify([
    tuple.ownerDid,
    tuple.protocol,
    tuple.rolePath,
    tuple.audienceContextId,
    tuple.recipientDid,
  ]);
}

async function collectAudienceTuples(
  enbox: Enbox,
  ownerDid: string,
  definitions: ProtocolDefinitionLike[],
  granteeDid: string | undefined,
): Promise<AudienceTuple[]> {
  const tuples = new Map<string, AudienceTuple>();

  for (const definition of definitions) {
    for (const rolePath of deliverableRolePaths(definition)) {
      const records = enbox.dwn.records.queryAll({
        filter: {
          protocol    : definition.protocol,
          protocolPath: rolePath,
        },
        pageSize: ROLE_QUERY_PAGE_SIZE,
      });

      for await (const record of records as AsyncIterable<RoleRecordLike>) {
        if (!record.recipient) {
          continue;
        }

        const audienceContextId = getRoleAudienceContextId(rolePath, record.contextId);
        if (audienceContextId === undefined) {
          continue;
        }

        const tuple: AudienceTuple = {
          ownerDid,
          protocol: definition.protocol,
          rolePath,
          recipientDid: record.recipient,
          audienceContextId,
          ...(rolePath.includes('/') && record.contextId ? { contextId: record.contextId } : {}),
          ...(granteeDid && { granteeDid }),
        };
        tuples.set(tupleKey(tuple), tuple);
      }
    }
  }

  return [...tuples.values()];
}

/** Inspect every active, encryption-capable role assignment for an identity. */
export async function fetchAudienceKeyDeliveries(
  agent: EnboxAgent,
  ownerDid: string,
): Promise<AudienceKeyDeliveryEntry[]> {
  const syncOptions = typeof agent.sync?.getIdentityOptions === 'function'
    ? await agent.sync.getIdentityOptions(ownerDid)
    : undefined;
  const granteeDid = syncOptions?.delegateDid as string | undefined;
  const enbox = new Enbox({
    agent,
    connectedDid: ownerDid,
    ...(granteeDid && { delegateDid: granteeDid }),
  });
  const { protocols, status: protocolStatus } = await enbox.dwn.protocols.query({});
  if (protocolStatus.code >= 300) {
    throw new Error(
      `Unable to inspect encrypted collaboration protocols: ${protocolStatus.code} ${protocolStatus.detail}`,
    );
  }

  const definitions = protocols
    .map(({ definition }) => definition as ProtocolDefinitionLike)
    .filter((definition) => deliverableRolePaths(definition).length > 0);
  if (definitions.length === 0) {
    return [];
  }

  const tuples = await collectAudienceTuples(enbox, ownerDid, definitions, granteeDid);
  const entries: AudienceKeyDeliveryEntry[] = [];

  for (const tuple of tuples) {
    let status: AudienceKeyDeliveryStatus;
    try {
      status = await agent.dwn.getAudienceKeyDeliveryStatus({
        target: tuple.ownerDid,
        protocol: tuple.protocol,
        rolePath: tuple.rolePath,
        recipientDid: tuple.recipientDid,
        ...(tuple.contextId && { contextId: tuple.contextId }),
        ...(tuple.granteeDid && { granteeDid: tuple.granteeDid }),
      });
    } catch (error) {
      status = {
        status: 'unverifiable',
        recipientDid: tuple.recipientDid,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    entries.push({
      key: tupleKey(tuple),
      ownerDid: tuple.ownerDid,
      protocol: tuple.protocol,
      rolePath: tuple.rolePath,
      recipientDid: tuple.recipientDid,
      ...(tuple.contextId && { contextId: tuple.contextId }),
      ...(tuple.granteeDid && { granteeDid: tuple.granteeDid }),
      status,
    });
  }

  return entries;
}

/** Repair a missing delivery without rewriting or duplicating the role record. */
export async function repairAudienceKeyDelivery(
  agent: EnboxAgent,
  entry: AudienceKeyDeliveryEntry,
): Promise<AudienceKeyDeliveryOutcome> {
  if (entry.granteeDid && entry.granteeDid !== entry.ownerDid) {
    throw new Error('Encrypted collaboration access can only be repaired by the identity owner.');
  }

  return agent.dwn.reprovisionAudienceKeyDelivery({
    target: entry.ownerDid,
    protocol: entry.protocol,
    rolePath: entry.rolePath,
    recipientDid: entry.recipientDid,
    ...(entry.contextId && { contextId: entry.contextId }),
  });
}
