/**
 * Protocol installation helper.
 *
 * Installs the required DWN protocols for an identity so that profile
 * records, social graph entries, and DWeb Connect grants can be created.
 *
 * Uses the high-level Enbox.using(defineProtocol(...)).configure() API
 * which is idempotent — protocols already installed are skipped.
 * After local install, sends each protocol to the remote DWN so that
 * subsequent record.send() calls don't fail with ProtocolNotFound.
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
];

/**
 * Configure (install) all required protocols for the given DID,
 * both locally and on the remote DWN.
 */
export async function installProtocols(
  agent: EnboxAgent,
  did: string,
): Promise<void> {
  const enbox = new Enbox({ agent, connectedDid: did });

  for (const definition of REQUIRED_PROTOCOLS) {
    try {
      const typed = enbox.using(defineProtocol(definition));
      const result = await typed.configure();
      const status = result?.status;
      const protocol = result?.protocol;

      if (status && status.code >= 300) {
        console.warn(
          `Protocol install for ${definition.protocol} returned ${status.code}: ${status.detail}`,
        );
        continue;
      }

      // Send to the remote DWN so record.send() works for this protocol
      if (protocol) {
        try {
          const { status: sendStatus } = await protocol.send(did);
          if (sendStatus.code >= 300) {
            console.warn(
              `Protocol remote send for ${definition.protocol} returned ${sendStatus.code}: ${sendStatus.detail}`,
            );
          }
        } catch (sendErr) {
          console.warn(`Failed to send protocol ${definition.protocol} to remote:`, sendErr);
        }
      }
    } catch (err) {
      console.warn(`Failed to install protocol ${definition.protocol}:`, err);
    }
  }
}
