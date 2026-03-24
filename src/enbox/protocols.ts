/**
 * Protocol installation helper.
 *
 * Installs the required DWN protocols for an identity so that profile
 * records, social graph entries, and DWeb Connect grants can be created.
 *
 * Uses the high-level Enbox.using(defineProtocol(...)).configure() API
 * which is idempotent — protocols already installed are skipped (202/409).
 * After local install, sends each protocol to the remote DWN so that
 * subsequent record.send() calls don't fail with ProtocolNotFound.
 *
 * IMPORTANT: This function THROWS on failure. If any protocol fails to
 * install locally, the entire operation stops. This prevents downstream
 * code from writing records against a protocol that doesn't exist,
 * which would cause persistent sync push failures.
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
 *
 * Throws if any protocol fails to install locally (status >= 300).
 * Remote send failures are logged but do not throw — sync will
 * eventually push the protocols to the remote.
 */
export async function installProtocols(
  agent: EnboxAgent,
  did: string,
): Promise<void> {
  const enbox = new Enbox({ agent, connectedDid: did });

  for (const definition of REQUIRED_PROTOCOLS) {
    const typed = enbox.using(defineProtocol(definition));
    const result = await typed.configure();
    const status = result?.status;
    const protocol = result?.protocol;

    if (!status || status.code >= 300) {
      throw new Error(
        `Failed to install protocol ${definition.protocol}: ${status?.code ?? 'unknown'} ${status?.detail ?? 'no status returned'}`,
      );
    }

    // Protocol installed successfully

    // Send to the remote DWN so record.send() works for this protocol.
    // Only send if newly configured (202). If already exists (200),
    // skip the remote send — it's already on the remote (and sending a
    // pulled protocol back causes IPLD encoding errors on undefined values).
    if (protocol && status.code === 202) {
      try {
        const { status: sendStatus } = await protocol.send(did);
        if (sendStatus.code >= 300) {
          console.warn(
            `Protocol remote send for ${definition.protocol}: ${sendStatus.code} ${sendStatus.detail}`,
          );
        }
      } catch (sendErr) {
        console.warn(`Protocol remote send failed for ${definition.protocol}:`, sendErr);
      }
    }
  }
}
