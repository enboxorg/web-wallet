/**
 * Owner-authored protocol replacement for the connect override path.
 *
 * The connect approval ceremony (`@enbox/agent`'s `prepareProtocol`) fails
 * closed when a requested protocol is already installed with a *different*
 * definition: it will not let a connection request replace an owner protocol,
 * and it exposes no override flag. When the owner explicitly opts into the
 * override, the wallet performs the replacement itself — as the owner — BEFORE
 * the ceremony runs: it authors a `ProtocolsConfigure` for the requested
 * definition locally, fans the signed message out to every reachable owner DWN
 * endpoint, and verifies each endpoint converges to the requested definition.
 *
 * Once local and remote state match, the ceremony's own fail-closed check sees
 * `configured`/`upgrade` for the protocol and proceeds normally. Convergence is
 * verified here (not left to the ceremony) so that a lagging endpoint surfaces a
 * specific "could not replace protocol" error rather than the ceremony's less
 * specific "conflicts with the latest definition" rejection.
 *
 * NOTE: this replaces (and, via sync, propagates) the protocol definition as
 * soon as it runs — the change persists even if a later ceremony step fails.
 * Callers must gate it behind explicit owner consent.
 */
import { DwnInterface, type DwnProtocolDefinition } from '@enbox/agent';

import { protocolDefinitionsMatch } from './protocol-install';

/** Per-request abort budget so one unhealthy endpoint can't stall approval. */
const RECONFIGURE_REQUEST_TIMEOUT_MS = 10_000;

type ProtocolQueryReply = {
  status: { code: number; detail: string };
  entries?: Array<{ descriptor?: { definition?: DwnProtocolDefinition } }>;
};

/** The minimal agent surface the override reconfigure depends on. */
export type ReconfigureAgent = {
  processDwnRequest: (params: {
    author: string;
    target: string;
    messageType: string;
    messageParams: Record<string, unknown>;
  }) => Promise<{ reply: { status: { code: number; detail: string } }; message?: unknown }>;
  rpc: {
    sendDwnRequest: (params: {
      dwnUrl: string;
      targetDid: string;
      message: unknown;
      signal?: AbortSignal;
    }) => Promise<ProtocolQueryReply>;
  };
};

function definitionFromReply(reply: ProtocolQueryReply): DwnProtocolDefinition | undefined {
  return reply.entries?.[0]?.descriptor?.definition;
}

/**
 * Replaces each requested protocol definition on the owner's local DWN and every
 * reachable endpoint. Definitions are processed sequentially so a composed
 * protocol's `uses` dependencies (which the caller should order first) land
 * before their dependents.
 *
 * @throws Error when a local configure fails, or when any reachable endpoint does
 *         not converge to the requested definition after the fan-out.
 */
export async function reconfigureProtocolsForOverride(
  selectedDid: string,
  agent: ReconfigureAgent,
  dwnEndpointUrls: string[],
  definitions: DwnProtocolDefinition[],
): Promise<void> {
  for (const definition of definitions) {
    await reconfigureProtocolForOverride(selectedDid, agent, dwnEndpointUrls, definition);
  }
}

async function reconfigureProtocolForOverride(
  selectedDid: string,
  agent: ReconfigureAgent,
  dwnEndpointUrls: string[],
  definition: DwnProtocolDefinition,
): Promise<void> {
  // Author the replacement locally. A ProtocolsConfigure is latest-wins by
  // timestamp, so the owner's fresh configure supersedes the installed one.
  // The protocol definition is the sole source of encryption policy: the agent
  // derives and injects $keyAgreement keys itself whenever the definition's
  // types demand encryption, so no caller-side switch exists anymore.
  const { reply: configureReply, message: configureMessage } = await agent.processDwnRequest({
    author        : selectedDid,
    target        : selectedDid,
    messageType   : DwnInterface.ProtocolsConfigure,
    messageParams : { definition },
  });
  if (configureReply.status.code !== 202 && configureReply.status.code !== 409) {
    throw new Error(
      `Could not replace protocol '${definition.protocol}' locally: ${configureReply.status.detail}`,
    );
  }
  if (configureMessage === undefined) {
    throw new Error(
      `Could not replace protocol '${definition.protocol}': no signed configure message was returned.`,
    );
  }

  // Local-only mode: connect approval enforces the >=1 reachable-endpoint
  // invariant during grant delivery, so an override against a provider with no
  // reachable DWN still cannot complete.
  if (dwnEndpointUrls.length === 0) return;

  // One signed query we can replay against every endpoint to verify convergence.
  const queryResult = await agent.processDwnRequest({
    author        : selectedDid,
    target        : selectedDid,
    messageType   : DwnInterface.ProtocolsQuery,
    messageParams : { filter: { protocol: definition.protocol } },
  });
  if (queryResult.reply.status.code !== 200 || queryResult.message === undefined) {
    throw new Error(
      `Could not verify protocol '${definition.protocol}' after replacing it: ${queryResult.reply.status.detail}`,
    );
  }
  const queryMessage = queryResult.message;

  const endpointResults = await Promise.all(
    dwnEndpointUrls.map(async (dwnUrl): Promise<string | undefined> => {
      try {
        const sendReply = await agent.rpc.sendDwnRequest({
          dwnUrl,
          targetDid : selectedDid,
          message   : configureMessage,
          signal    : AbortSignal.timeout(RECONFIGURE_REQUEST_TIMEOUT_MS),
        });
        // 202 (accepted) and 409 (an identical or newer configure already exists)
        // both count as delivered; the convergence re-query is the arbiter.
        if (sendReply.status.code !== 202 && sendReply.status.code !== 409) {
          return `${dwnUrl}: configure rejected (${sendReply.status.code}): ${sendReply.status.detail}`;
        }

        const verifyReply = await agent.rpc.sendDwnRequest({
          dwnUrl,
          targetDid : selectedDid,
          message   : queryMessage,
          signal    : AbortSignal.timeout(RECONFIGURE_REQUEST_TIMEOUT_MS),
        });
        if (verifyReply.status.code !== 200) {
          return `${dwnUrl}: verification re-query rejected (${verifyReply.status.code}): ${verifyReply.status.detail}`;
        }
        const remoteDefinition = definitionFromReply(verifyReply);
        if (remoteDefinition === undefined || !protocolDefinitionsMatch(remoteDefinition, definition)) {
          return `${dwnUrl}: endpoint did not converge to the requested definition`;
        }
        return undefined;
      } catch (err) {
        return `${dwnUrl}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }),
  );

  const failures = endpointResults.filter((result): result is string => result !== undefined);
  if (failures.length > 0) {
    throw new Error(
      `Could not replace protocol '${definition.protocol}' on every reachable DWN endpoint. ${failures.join('; ')}`,
    );
  }
}
