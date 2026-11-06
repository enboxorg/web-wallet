import { executeConnectApproval } from '@enbox/agent';
import type { ConnectPermissionRequest } from '@enbox/connect';

import { CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS } from '@/features/connect/connect-session-duration';
import { fetchModules } from '@/enbox/queries/identity-queries';
import type { EnboxAgent } from '@/enbox/types';
import type { PermissionSessionGroup } from './permission-sessions';

function scopeKey(scope: Record<string, unknown>): string {
  return JSON.stringify([
    scope.interface,
    scope.method,
    scope.module,
    scope.modulePath,
    scope.contextId,
  ]);
}

/**
 * Wallet-initiated renewal of an expired delegate session: re-runs the
 * connect approval ceremony with the session's delegate DID pre-supplied, so
 * fresh grants (and grant keys / revocation grants) are created and fanned
 * out to the owner's DWN endpoints. The app picks them up on its next sync —
 * no round trip through the app's UI is needed because it already holds the
 * delegate keys.
 */
export async function renewExpiredSession(
  agent: EnboxAgent,
  ownerDid: string,
  session: PermissionSessionGroup,
): Promise<void> {
  const dedupedScopes = new Map<string, ConnectPermissionRequest['permissionScopes'][number]>();
  for (const grant of session.grants) {
    const scope = grant.scope as Record<string, unknown> | undefined;
    if (!scope || typeof scope.module !== 'string' || scope.module.length === 0) {
      throw new Error('This session has a permission without a module and cannot be renewed.');
    }
    const key = scopeKey(scope);
    if (!dedupedScopes.has(key)) {
      dedupedScopes.set(key, scope as ConnectPermissionRequest['permissionScopes'][number]);
    }
  }

  const installedModules = await fetchModules(agent, ownerDid);
  const definitionByUri = new Map(
    installedModules.map((module) => [module.uri, module.definition]),
  );

  const scopesByModule = new Map<string, ConnectPermissionRequest['permissionScopes']>();
  for (const scope of dedupedScopes.values()) {
    const module = (scope as { module: string }).module;
    const scopes = scopesByModule.get(module) ?? [];
    scopes.push(scope);
    scopesByModule.set(module, scopes);
  }

  const permissionRequests: ConnectPermissionRequest[] = [...scopesByModule.entries()]
    .map(([module, permissionScopes]) => {
      const moduleDefinition = definitionByUri.get(module);
      if (!moduleDefinition) {
        throw new Error(
          'A module this app used is no longer installed, so its access cannot be renewed. The app needs to reconnect.',
        );
      }
      return { moduleDefinition, permissionScopes } as ConnectPermissionRequest;
    });

  const previous = session.session;
  await executeConnectApproval({
    agent,
    providerDid               : ownerDid,
    approvedSessionTtlSeconds : CONNECT_SESSION_APPROVAL_DEFAULT_TTL_SECONDS,
    transport                 : previous.transport ?? 'postMessage',
    request                   : {
      appName      : previous.appName ?? 'Unknown app',
      appIcon      : previous.appIcon,
      delegateDid  : session.grantee,
      clientMetadata: {
        origin    : previous.origin,
        userAgent : previous.userAgent,
        platform  : previous.platform,
        language  : previous.language,
        languages : previous.languages,
        timezone  : previous.timezone,
      },
      permissionRequests,
    },
  });
}
