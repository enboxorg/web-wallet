/**
 * Permission display for DWeb Connect consent screens.
 *
 * Shows a rich, user-friendly breakdown of what protocols and permissions
 * a dapp is requesting, with human-readable names, descriptions,
 * colour-coded scope badges, and encryption indicators.
 */
import { ChevronDown, Code, Lock, Settings, Shield } from 'lucide-react';
import type { ConnectPermissionRequest, DwnPermissionScope } from '@enbox/agent';
import { getProtocolInfo, getScopeLabel, getScopeColor, type ScopeColor } from '@/lib/protocol-names';

interface PermissionDisplayProps {
  /** The permission requests from the dapp. */
  permissions: ConnectPermissionRequest[];
}

/** Colour classes for scope badges. */
const SCOPE_COLOR_CLASSES: Record<ScopeColor, string> = {
  green : 'bg-green-500/15 text-green-400 border-green-500/20',
  amber : 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  red   : 'bg-red-500/15 text-red-400 border-red-500/20',
  blue  : 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  gray  : 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

type ProtocolDefinition = ConnectPermissionRequest['protocolDefinition'];

function isInternalConnectScope(scope: DwnPermissionScope): boolean {
  return (
    (scope?.interface === 'Protocols' && scope?.method === 'Query')
    || (scope?.interface === 'Messages' && scope?.method === 'Read')
  );
}

function getDisplayScopes(permissionScopes: ConnectPermissionRequest['permissionScopes']) {
  const scopes = new Map<string, { interface: string; method: string }>();

  for (const scope of permissionScopes) {
    if (isInternalConnectScope(scope)) continue;

    const scopeInterface = scope.interface;
    const method = scope.method;

    const key = `${scopeInterface}.${method}`;
    scopes.set(key, { interface: scopeInterface, method });
  }

  return [...scopes.values()];
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function collectStructurePaths(
  structure: Record<string, unknown> | undefined,
  prefix = '',
): string[] {
  if (!structure) return [];

  const paths: string[] = [];
  for (const [key, value] of Object.entries(structure)) {
    const path = prefix ? `${prefix}/${key}` : key;
    paths.push(path);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = value as Record<string, unknown>;
      const childStructure = Object.fromEntries(
        Object.entries(child).filter(([childKey, childValue]) =>
          !childKey.startsWith('$')
          && childValue
          && typeof childValue === 'object'
          && !Array.isArray(childValue)
        ),
      );
      paths.push(...collectStructurePaths(childStructure, path));
    }
  }

  return paths;
}

function getEncryptedTypeCount(protocolDefinition: ProtocolDefinition): number {
  return Object.values(protocolDefinition.types ?? {})
    .filter((type: any) => type?.encryptionRequired === true)
    .length;
}

function ProtocolAdvancedView({
  protocolDefinition,
  paths,
}: {
  protocolDefinition: ProtocolDefinition;
  paths: string[];
}) {
  const typeNames = Object.keys(protocolDefinition.types ?? {});
  const encryptedTypeCount = getEncryptedTypeCount(protocolDefinition);
  const protocolJson = JSON.stringify(protocolDefinition, null, 2);

  return (
    <details className="group border-t border-border-subtle pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-text-secondary hover:text-text-primary">
        <span className="inline-flex items-center gap-1.5">
          <Code className="h-3.5 w-3.5" />
          Advanced protocol view
        </span>
        <ChevronDown className="h-4 w-4 text-text-ghost transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-3 space-y-3">
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-text-ghost">Types</dt>
            <dd className="mt-1 text-text-primary">{pluralize(typeNames.length, 'type')}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-text-ghost">Record paths</dt>
            <dd className="mt-1 text-text-primary">{pluralize(paths.length, 'path')}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-text-ghost">Encrypted types</dt>
            <dd className="mt-1 text-text-primary">{pluralize(encryptedTypeCount, 'type')}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-text-ghost">Protocol URI</dt>
            <dd className="mt-1 truncate font-mono text-text-primary" title={protocolDefinition.protocol}>
              {protocolDefinition.protocol}
            </dd>
          </div>
        </dl>

        {typeNames.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-text-ghost">Types</p>
            <div className="flex flex-wrap gap-1.5">
              {typeNames.map((typeName) => (
                <span
                  key={typeName}
                  className="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-text-secondary"
                >
                  {typeName}
                </span>
              ))}
            </div>
          </div>
        )}

        {paths.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-text-ghost">Record paths</p>
            <div className="flex flex-wrap gap-1.5">
              {paths.map((path) => (
                <span
                  key={path}
                  className="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-text-secondary"
                >
                  {path}
                </span>
              ))}
            </div>
          </div>
        )}

        <pre className="max-h-72 overflow-auto rounded-md bg-surface-1 p-3 font-mono text-[11px] leading-relaxed text-text-tertiary">
          {protocolJson}
        </pre>
      </div>
    </details>
  );
}

export function PermissionDisplay({ permissions }: PermissionDisplayProps) {
  if (permissions.length === 0) { return null; }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
        Permissions Requested
      </p>

      {permissions.map((perm, i) => {
        const protocolUri = perm.protocolDefinition.protocol;
        const info = getProtocolInfo(protocolUri);
        const hasEncryptedTypes = Object.values(perm.protocolDefinition.types ?? {})
          .some((type: any) => type?.encryptionRequired === true);

        const displayScopes = getDisplayScopes(perm.permissionScopes);
        const paths = collectStructurePaths(
          perm.protocolDefinition.structure as Record<string, unknown> | undefined,
        );

        return (
          <div
            key={i}
            className="rounded-xl border border-border-default bg-surface-2 p-4 space-y-3"
          >
            {/* Protocol name + encryption badge */}
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-accent shrink-0" />
              <h4 className="text-sm font-semibold text-text-primary truncate">
                {info.name}
              </h4>
              {hasEncryptedTypes && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/20 px-2 py-0.5 text-[10px] font-medium"
                  title="This protocol uses end-to-end encryption"
                >
                  <Lock className="h-3 w-3" />
                  Encrypted
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-text-secondary leading-relaxed">
              {info.description}
            </p>

            <div className="flex items-start gap-2 border-t border-border-subtle pt-3">
              <Settings className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary">
                  Protocol setup
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  Your wallet will make sure this protocol is configured on your DWN endpoints before granting app access.
                </p>
              </div>
            </div>

            {/* Scope badges */}
            {displayScopes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {displayScopes.map((scope) => {
                  const color = getScopeColor(scope.method);
                  return (
                    <span
                      key={`${scope.interface}.${scope.method}`}
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SCOPE_COLOR_CLASSES[color]}`}
                    >
                      {getScopeLabel(scope)}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Raw protocol URI (collapsed detail) */}
            <p className="text-[10px] font-mono text-text-ghost truncate" title={protocolUri}>
              {protocolUri}
            </p>

            <ProtocolAdvancedView
              protocolDefinition={perm.protocolDefinition}
              paths={paths}
            />
          </div>
        );
      })}
    </div>
  );
}
