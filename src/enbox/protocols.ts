/**
 * Protocol installation helper.
 *
 * Installs the required DWN protocols for an identity so that profile
 * records and DWeb Connect grants can be created.
 *
 * Uses the published typed protocols through Enbox.using(...).configure()
 * which is idempotent: protocols already installed locally return 200.
 * Remote replication is owned by the SDK sync engine. Sync push routes local
 * records through remote replicated admission, which fetches any required
 * protocol configs as dependencies.
 *
 * IMPORTANT: This function THROWS on local configuration failure. This prevents
 * downstream code from writing records against a protocol that doesn't exist
 * locally, while still leaving remote propagation to normal sync.
 */

import { Effect } from 'effect';
import type { TypedProtocol } from '@enbox/api';

import { Enbox } from '@enbox/api';
import { ConnectProtocol, ProfileProtocol } from '@enbox/protocols';
import type { EnboxAgent } from './types';
import { ProtocolInstallationError, sdkError } from './effect/errors';
import { CurrentAgent, currentAgentLayer } from './effect/services';
import { runEnboxPromise } from './effect/runtime';

/** All protocols the wallet requires for every identity. */
const REQUIRED_PROTOCOLS: readonly TypedProtocol[] = [
  ProfileProtocol,
  ConnectProtocol,
];

export const IDENTITY_SYNC_PROTOCOLS = REQUIRED_PROTOCOLS.map(
  (protocol) => protocol.definition.protocol,
) as [string, ...string[]];

function statusMessage(status: { code?: number; detail?: string } | undefined): string {
  return `${status?.code ?? 'unknown'} ${status?.detail ?? 'no status returned'}`;
}

function configureLocalProtocolEffect(
  enbox: Enbox,
  typedProtocol: typeof REQUIRED_PROTOCOLS[number],
) {
  return Effect.gen(function* () {
    const { definition } = typedProtocol;
    const result = yield* Effect.tryPromise({
      try: async () => {
        const typed = enbox.using(typedProtocol);
        return typed.configure();
      },
      catch: sdkError(`protocol.configure:${definition.protocol}`),
    });
    const status = result?.status;
    const protocol = result?.protocol;

    if (!status || status.code >= 300 || !protocol) {
      return yield* Effect.fail(
        new ProtocolInstallationError({
          protocol: definition.protocol,
          statusCode: status?.code,
          statusDetail: status?.detail,
          cause: result,
          message: `Failed to install protocol ${definition.protocol}: ${statusMessage(status)}`,
        }),
      );
    }
  });
}

export function installProtocolsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const enbox = new Enbox({ agent, connectedDid: did });

    yield* Effect.forEach(
      REQUIRED_PROTOCOLS,
      (definition) => configureLocalProtocolEffect(enbox, definition),
      { discard: true },
    );
  });
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
  await runEnboxPromise(
    installProtocolsEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}
