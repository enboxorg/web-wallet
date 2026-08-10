/**
 * Protocol installation helper.
 *
 * Installs the required DWN protocols for an identity so that profile
 * records and DWeb Connect grants can be created.
 *
 * Uses the SDK's application-manifest readiness API, which is idempotent.
 * Remote replication is owned by the SDK sync engine. Sync push routes local
 * records through remote replicated admission, which fetches any required
 * protocol configs as dependencies.
 *
 * IMPORTANT: This function THROWS on local configuration failure. This prevents
 * downstream code from writing records against a protocol that doesn't exist
 * locally, while still leaving remote propagation to normal sync.
 */

import { Effect } from 'effect';

import {
  defineApplicationManifest,
  Enbox,
  ServiceConfigProtocol,
} from '@enbox/api';
import { ConnectProtocol, ProfileProtocol } from '@enbox/protocols';
import { sdkError } from './effect/errors';
import { CurrentAgent } from './effect/services';

const WALLET_APPLICATION = defineApplicationManifest({
  protocols: [
    ProfileProtocol,
    ConnectProtocol,
    { protocol: ServiceConfigProtocol, permissions: ['read'] },
  ],
} as const);

export const IDENTITY_SYNC_PROTOCOLS = WALLET_APPLICATION.protocols.map(
  ({ protocol }) => protocol.definition.protocol,
) as [string, ...string[]];

export function installProtocolsEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    const enbox = new Enbox({ agent, connectedDid: did });

    yield* Effect.tryPromise({
      try: () => enbox.protocols.ensureReady({
        application : WALLET_APPLICATION,
        publish     : false,
      }),
      catch: sdkError('protocols.ensureReady'),
    });
  });
}
