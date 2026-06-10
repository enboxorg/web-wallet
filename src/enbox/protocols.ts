/**
 * Protocol installation helper.
 *
 * Installs the required DWN protocols for an identity so that profile
 * records, social graph entries, and DWeb Connect grants can be created.
 *
 * Uses the high-level Enbox.using(defineProtocol(...)).configure() API
 * which is idempotent: protocols already installed locally return 200.
 * Remote replication is owned by the SDK sync engine. Sync push routes local
 * records through remote replicated admission, which fetches any required
 * protocol configs as dependencies.
 *
 * IMPORTANT: This function THROWS on local configuration failure. This prevents
 * downstream code from writing records against a protocol that doesn't exist
 * locally, while still leaving remote propagation to normal sync.
 */

import { Enbox, defineProtocol } from '@enbox/api';
import { ProfileDefinition, SocialGraphDefinition, ConnectDefinition } from '@enbox/protocols';
import type { EnboxAgent } from './types';

/**
 * All protocols the wallet requires for every identity.
 *
 * ORDER MATTERS: SocialGraph must be installed before Profile because
 * Profile is a composed protocol that references SocialGraph.
 */
const REQUIRED_PROTOCOLS = [
  SocialGraphDefinition,
  ProfileDefinition,
  ConnectDefinition,
] as const;

export const IDENTITY_SYNC_PROTOCOLS = REQUIRED_PROTOCOLS.map(
  (definition) => definition.protocol,
) as [string, ...string[]];

function statusMessage(status: { code?: number; detail?: string } | undefined): string {
  return `${status?.code ?? 'unknown'} ${status?.detail ?? 'no status returned'}`;
}

async function configureLocalProtocols(
  agent: EnboxAgent,
  did: string,
): Promise<void> {
  const enbox = new Enbox({ agent, connectedDid: did });

  for (const definition of REQUIRED_PROTOCOLS) {
    const typed = enbox.using(defineProtocol(definition));
    const result = await typed.configure();
    const status = result?.status;
    const protocol = result?.protocol;

    if (!status || status.code >= 300 || !protocol) {
      throw new Error(
        `Failed to install protocol ${definition.protocol}: ${statusMessage(status)}`,
      );
    }

  }
}

/**
 * Configure (install) all required protocols for the given DID,
 * locally. Remote propagation is handled by sync.
 *
 * Throws if any protocol fails to install locally.
 */
export async function installProtocols(
  agent: EnboxAgent,
  did: string,
): Promise<void> {
  await configureLocalProtocols(agent, did);
}
