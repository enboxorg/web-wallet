/**
 * Protocol installation helper.
 *
 * Installs the required DWN protocols for an identity so that profile
 * records, social graph entries, and DWeb Connect grants can be created.
 *
 * Uses the high-level Enbox.using(defineProtocol(...)).configure() API
 * which is idempotent: protocols already installed locally return 200.
 * After local install, sends each protocol to every remote DWN so that
 * subsequent record.send() calls don't fail with ProtocolNotFound.
 *
 * IMPORTANT: This function THROWS on failure. If any required local or
 * remote install fails after retries, the entire operation stops. This
 * prevents downstream code from writing records against a protocol that
 * doesn't exist, which would cause persistent sync push failures.
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

type ProtocolDefinition = typeof REQUIRED_PROTOCOLS[number];
type ConfiguredProtocol = {
  definition: ProtocolDefinition;
  message: unknown;
};

export const IDENTITY_SYNC_PROTOCOLS = REQUIRED_PROTOCOLS.map(
  (definition) => definition.protocol,
) as [string, ...string[]];

const REMOTE_INSTALL_RETRY_DELAYS_MS = [0, 1_000, 2_000, 4_000, 8_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusMessage(status: { code?: number; detail?: string } | undefined): string {
  return `${status?.code ?? 'unknown'} ${status?.detail ?? 'no status returned'}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRetryableProtocolBootstrapFailure(message: string): boolean {
  return (
    message.includes('GetPublicKeyNotFound') ||
    message.includes('Pkarr record not found') ||
    message.includes('notFound') ||
    message.includes('ComposedProtocolNotInstalled') ||
    message.includes('ProtocolAuthorizationProtocolNotFound') ||
    message.includes('ProtocolNotFound') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError')
  );
}

async function configureLocalProtocols(
  agent: EnboxAgent,
  did: string,
): Promise<ConfiguredProtocol[]> {
  const enbox = new Enbox({ agent, connectedDid: did });
  const configured: ConfiguredProtocol[] = [];

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

    configured.push({
      definition,
      message: protocol.toJSON(),
    });
  }

  return configured;
}

async function sendProtocolToEndpoint(
  agent: EnboxAgent,
  did: string,
  endpoint: string,
  configured: ConfiguredProtocol,
): Promise<void> {
  const reply = await agent.rpc.sendDwnRequest({
    dwnUrl: endpoint,
    targetDid: did,
    message: configured.message,
  });

  const code = reply?.status?.code;
  if ((code >= 200 && code < 300) || code === 409) {
    return;
  }

  throw new Error(
    `Protocol remote send for ${configured.definition.protocol} to ${endpoint}: ` +
    statusMessage(reply?.status),
  );
}

async function installProtocolsOnEndpoint(
  agent: EnboxAgent,
  did: string,
  endpoint: string,
  configuredProtocols: ConfiguredProtocol[],
): Promise<void> {
  let lastError: unknown;

  for (const delayMs of REMOTE_INSTALL_RETRY_DELAYS_MS) {
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    try {
      for (const configured of configuredProtocols) {
        await sendProtocolToEndpoint(agent, did, endpoint, configured);
      }
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableProtocolBootstrapFailure(errorMessage(error))) {
        break;
      }
    }
  }

  throw new Error(
    `Failed to install required protocols for ${did} on ${endpoint}: ${errorMessage(lastError)}`,
  );
}

/**
 * Configure (install) all required protocols for the given DID,
 * both locally and on the remote DWN.
 *
 * Throws if any protocol fails to install locally or on any configured
 * remote endpoint after retries.
 */
export async function installProtocols(
  agent: EnboxAgent,
  did: string,
  dwnEndpoints: string[],
): Promise<void> {
  const configuredProtocols = await configureLocalProtocols(agent, did);

  // Each endpoint gets the full dependency-ordered protocol chain. Retrying
  // the chain handles the window where a freshly published did:dht DID is not
  // yet resolvable by the remote DWN for signature verification.
  await Promise.all(
    dwnEndpoints.map((endpoint) =>
      installProtocolsOnEndpoint(agent, did, endpoint, configuredProtocols)
    ),
  );
}
