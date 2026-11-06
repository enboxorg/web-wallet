/**
 * Module installation helper.
 *
 * Installs the required DWN modules for an identity so that profile
 * records and DWeb Connect grants can be created.
 *
 * Uses the SDK's application-manifest readiness API, which is idempotent.
 * Remote replication is owned by the SDK sync engine. Sync push routes local
 * records through remote replicated admission, which fetches any required
 * module configs as dependencies.
 *
 * IMPORTANT: This function THROWS on local configuration failure. This prevents
 * downstream code from writing records against a module that doesn't exist
 * locally, while still leaving remote propagation to normal sync.
 */

import { Effect } from 'effect';

import {
  defineApplicationManifest,
  ServiceConfigModule,
} from '@enbox/browser';
import { ConnectModule, ProfileModule } from '@enbox/modules';
import { sdkError } from './effect/errors';
import { withEnboxEffect } from './effect/enbox-effect';

const WALLET_APPLICATION = defineApplicationManifest({
  modules: [
    ProfileModule,
    ConnectModule,
    { module: ServiceConfigModule, permissions: ['read'] },
  ],
} as const);

export const IDENTITY_SYNC_MODULES = WALLET_APPLICATION.modules.map(
  ({ module }) => module.definition.module,
) as [string, ...string[]];

export function installModulesEffect(did: string) {
  return withEnboxEffect(did, (enbox) =>
    Effect.tryPromise({
      try: () => enbox.modules.ensureReady({
        application : WALLET_APPLICATION,
        publish     : false,
      }),
      catch: sdkError('modules.ensureReady'),
    })
  );
}
