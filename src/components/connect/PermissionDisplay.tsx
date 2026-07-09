/**
 * Permission display for DWeb Connect consent screens.
 *
 * Keeps the primary surface focused on consent:
 * - what the requester can do
 * - how long access lasts
 * - where setup/protocol mechanics can be inspected
 */
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code,
  Download,
  History,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConnectPermissionRequest } from '@enbox/agent';
import {
  protocolDefinitionsMatch,
  type ProtocolSetupStatus,
} from '@/features/connect/protocol-install';
import { formatConnectSessionDuration } from '@/features/connect/connect-session-duration';
import { getCanonicalProtocolDefinition, getProtocolInfo } from '@/lib/protocol-names';
import {
  formatActionPhrase,
  getDisplayScopes,
  getHighestPermissionRisk,
  getPermissionActions,
  isInternalConnectScope,
  mergePermissionRequestsByProtocol,
} from './connect-scope-display';
import type { DisplayScope, PermissionRisk } from './connect-scope-display';

interface PermissionDisplayProps {
  /** The permission requests from the dapp. */
  permissions: ConnectPermissionRequest[];
  /** Setup status keyed by protocol URI. */
  protocolSetupStatuses?: Record<string, ProtocolSetupStatus>;
  /** Number of active matching sessions for this app + identity. */
  existingSessionCount?: number;
  /** Trust anchor shown in section copy, usually the verified origin. */
  requesterLabel?: string;
  /** Requested connect session lifetime. Defaults and caps match the SDK. */
  sessionDurationSeconds?: number;
  /** Retry a failed protocol setup check. */
  onRetryProtocolSetup?: () => void;
}

type ProtocolDefinition = ConnectPermissionRequest['protocolDefinition'];

type ProtocolAccess = {
  permission: ConnectPermissionRequest;
  protocolUri: string;
  name: string;
  description: string;
  isKnownProtocol: boolean;
  displayScopes: DisplayScope[];
  paths: string[];
  hasEncryptedTypes: boolean;
  sharesDecryptionKeys: boolean;
  setupStatus: ProtocolSetupStatus;
};

type SetupStatusDisplay = {
  label: string;
};

const SETUP_STATUS_DISPLAY: Record<ProtocolSetupStatus, SetupStatusDisplay> = {
  checking: {
    label : 'Checking',
  },
  configured: {
    label : 'Already ready',
  },
  conflict: {
    label : 'Blocked',
  },
  install: {
    label : 'Will add',
  },
  upgrade: {
    label : 'Encryption upgrade',
  },
  unavailable: {
    label : 'Needs verification',
  },
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function capitalize(value: string): string {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function hostLabel(value: string): string {
  try {
    return new URL(value).host || value;
  } catch {
    return value;
  }
}

function protocolUriLabel(uri: string): string {
  try {
    const url = new URL(uri);
    return `${url.host}${url.pathname}`;
  } catch {
    return uri;
  }
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

function isEncryptedType(type: unknown): boolean {
  return Boolean(
    type
    && typeof type === 'object'
    && 'encryptionRequired' in type
    && type.encryptionRequired === true
  );
}

function getEncryptedTypeCount(protocolDefinition: ProtocolDefinition): number {
  return Object.values(protocolDefinition.types ?? {})
    .filter(isEncryptedType)
    .length;
}

function getProtocolAccess(
  permissions: ConnectPermissionRequest[],
  protocolSetupStatuses?: Record<string, ProtocolSetupStatus>,
): ProtocolAccess[] {
  return mergePermissionRequestsByProtocol(permissions).map((permission) => {
    const protocolUri = permission.protocolDefinition.protocol;
    const info = getProtocolInfo(protocolUri);
    const paths = collectStructurePaths(
      permission.protocolDefinition.structure as Record<string, unknown> | undefined,
    );
    const hasEncryptedTypes = Object.values(permission.protocolDefinition.types ?? {})
      .some(isEncryptedType);
    const canonicalDefinition = getCanonicalProtocolDefinition(protocolUri);
    const isCanonicalProtocol = canonicalDefinition !== undefined
      && protocolDefinitionsMatch(canonicalDefinition, permission.protocolDefinition);

    return {
      permission,
      protocolUri,
      name: info.name,
      description: info.description,
      isKnownProtocol: isCanonicalProtocol,
      displayScopes: getDisplayScopes(permission.permissionScopes),
      paths,
      hasEncryptedTypes,
      sharesDecryptionKeys: permission.permissionScopes.some((scope) =>
        scope.interface === 'Records' && scope.method === 'Read'
      ),
      setupStatus: protocolSetupStatuses?.[protocolUri] ?? 'checking',
    };
  });
}

function actionBadgeClasses(risk: PermissionRisk): string {
  switch (risk) {
    case 'delete':
      return 'border-red-500/30 bg-red-500/10 text-red-300';
    case 'edit':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
    default:
      return 'border-border-subtle bg-surface-1 text-text-secondary';
  }
}

function rowRiskClasses(risk: PermissionRisk): string {
  switch (risk) {
    case 'delete':
      return 'border-l-red-500/70';
    case 'edit':
      return 'border-l-amber-500/70';
    default:
      return 'border-l-border-subtle';
  }
}

function formatAccessSentence(item: ProtocolAccess): string {
  const actions = getPermissionActions(item.displayScopes);
  const objectLabel = item.isKnownProtocol ? `your ${item.name}` : 'a custom data type';
  return `${capitalize(formatActionPhrase(actions))} ${objectLabel}`;
}

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 active session' : `${count} active sessions`;
}

function AccessRows({
  access,
  requesterLabel = 'this app',
}: {
  access: ProtocolAccess[];
  requesterLabel?: string;
}) {
  const requesterSentenceLabel = hostLabel(requesterLabel);
  const encryptedAccess = access.filter((item) => item.hasEncryptedTypes && item.sharesDecryptionKeys);
  const showSharedEncryptedNote = encryptedAccess.length > 1;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
        What {requesterSentenceLabel} will be able to do
      </p>

      <div className="overflow-hidden rounded-xl border border-border-default bg-surface-2">
        {access.map((item, index) => {
          const actions = getPermissionActions(item.displayScopes);
          const risk = getHighestPermissionRisk(actions);
          const supportScopes = item.permission.permissionScopes.filter(isInternalConnectScope);
          const hasPrimaryScopes = item.permission.permissionScopes.some(
            (scope) => !isInternalConnectScope(scope),
          );

          return (
            <div
              key={item.protocolUri}
              className={`border-l-2 px-4 py-3 ${rowRiskClasses(risk)} ${index > 0 ? 'border-t border-t-border-subtle' : ''}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatAccessSentence(item)}
                  </p>
                  {item.isKnownProtocol && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                      {item.description}
                    </p>
                  )}
                  {!item.isKnownProtocol && (
                    <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={item.protocolUri}>
                      Custom protocol: {protocolUriLabel(item.protocolUri)}
                    </p>
                  )}
                </div>

                {actions.length > 1 && (
                  <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                    {actions.map((action) => (
                      <span
                        key={action.key}
                        className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${actionBadgeClasses(action.risk)}`}
                        title={action.label}
                      >
                        {action.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {item.hasEncryptedTypes && item.sharesDecryptionKeys && !showSharedEncryptedNote && (
                <p className="mt-2 inline-flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Approval permanently shares decryption keys for this scope. Expiry stops authorized DWN access, but matching ciphertext obtained now or later can still be decrypted.
                  </span>
                </p>
              )}
              {item.hasEncryptedTypes && !item.sharesDecryptionKeys && (
                <p className="mt-2 inline-flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Stored encrypted. This approval does not share private decryption keys.</span>
                </p>
              )}
              {hasPrimaryScopes && supportScopes.length > 0 && (
                <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                  Additional grants: {supportScopes.map((scope) => `${scope.interface}.${scope.method}`).join(', ')}.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {showSharedEncryptedNote && (
        <p className="inline-flex items-start gap-1.5 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text-secondary">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Approval permanently shares decryption keys for these scopes. Expiry stops authorized DWN access, but matching ciphertext obtained now or later can still be decrypted.
          </span>
        </p>
      )}
    </section>
  );
}

function SessionTerms({
  existingSessionCount,
  sessionDurationSeconds,
}: {
  existingSessionCount: number;
  sessionDurationSeconds?: number;
}) {
  const durationLabel = formatConnectSessionDuration(sessionDurationSeconds);

  return (
    <section className="rounded-xl border border-border-default bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Access lasts {durationLabel}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            It expires automatically. You can revoke it later from this identity&apos;s Permissions tab.
          </p>
        </div>
      </div>

      {existingSessionCount > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2">
          <History className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
          <p className="text-xs leading-relaxed text-text-secondary">
            This requester already has {sessionCountLabel(existingSessionCount)} for this identity.
            Approving creates a separate session with {durationLabel} of access.
          </p>
        </div>
      )}
    </section>
  );
}

function SetupStatusBadge({ status }: { status: ProtocolSetupStatus }) {
  const display = SETUP_STATUS_DISPLAY[status];
  const classes = status === 'conflict'
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : 'border-border-subtle bg-surface-1 text-text-secondary';

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${classes}`}>
      {display.label}
    </span>
  );
}

function SetupDetailGroup({
  title,
  summary,
  items,
  icon: Icon,
}: {
  title: string;
  summary: string;
  items: ProtocolAccess[];
  icon: LucideIcon;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-1 p-3">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-text-primary">
              {title}
            </p>
            <span className="text-[10px] font-medium text-text-ghost">
              {pluralize(items.length, 'item')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {summary}
          </p>

          <div className="mt-2 space-y-1.5">
            {items.map((item) => (
              <div
                key={item.protocolUri}
                className="flex flex-col gap-1 rounded-md bg-surface-2 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-primary">
                    {item.isKnownProtocol ? item.name : 'Custom protocol'}
                  </p>
                  {!item.isKnownProtocol && (
                    <p className="truncate font-mono text-[10px] text-text-ghost" title={item.protocolUri}>
                      {protocolUriLabel(item.protocolUri)}
                    </p>
                  )}
                </div>
                <SetupStatusBadge status={item.setupStatus} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupDetails({ access }: { access: ProtocolAccess[] }) {
  const setupChanges = access.filter((item) => item.setupStatus === 'install');
  const encryptionUpgrades = access.filter((item) => item.setupStatus === 'upgrade');
  const conflicts = access.filter((item) => item.setupStatus === 'conflict');
  const setupChecks = access.filter((item) =>
    item.setupStatus === 'checking'
    || item.setupStatus === 'unavailable'
  );
  const ready = access.filter((item) => item.setupStatus === 'configured');

  return (
    <section className="space-y-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
          Wallet setup
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          Protocol setup controls record authorization. New policies are installed before the app grant; existing policies are never replaced.
        </p>
      </div>

      <SetupDetailGroup
        icon={Download}
        title="Will add setup"
        summary="The wallet installs this authorization policy before creating the grant."
        items={setupChanges}
      />
      <SetupDetailGroup
        icon={Lock}
        title="Will upgrade encryption"
        summary="The authorization policy is unchanged; the wallet adds its current encryption keys."
        items={encryptionUpgrades}
      />
      <SetupDetailGroup
        icon={AlertTriangle}
        title="Setup conflict"
        summary="The wallet will not replace an existing owner protocol during a connection."
        items={conflicts}
      />
      <SetupDetailGroup
        icon={setupChecks.some((item) => item.setupStatus === 'unavailable') ? AlertTriangle : Loader2}
        title="Still checking setup"
        summary="The wallet will verify these before approval finishes."
        items={setupChecks}
      />
      <SetupDetailGroup
        icon={CheckCircle2}
        title="Already ready"
        summary="The wallet will not change these."
        items={ready}
      />
    </section>
  );
}

function ProtocolConflictNotice({ access }: { access: ProtocolAccess[] }) {
  if (!access.some((item) => item.setupStatus === 'conflict')) return null;

  return (
    <section role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
        <div>
          <p className="text-sm font-medium text-red-200">Protocol setup conflict</p>
          <p className="mt-1 text-xs leading-relaxed text-red-200/80">
            A requested protocol differs from this identity&apos;s installed setup. The wallet will not replace it during a connection.
          </p>
        </div>
      </div>
    </section>
  );
}

function ProtocolSetupUnavailableNotice({
  access,
  onRetry,
}: {
  access: ProtocolAccess[];
  onRetry?: () => void;
}) {
  if (!access.some((item) => item.setupStatus === 'unavailable')) return null;

  return (
    <section role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-warning">Protocol setup could not be verified</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Approval remains blocked until the wallet can check the selected identity&apos;s local protocol state.
          </p>
          {onRetry && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-warning hover:underline"
              onClick={onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry check
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function TechnicalDetails({ access }: { access: ProtocolAccess[] }) {
  return (
    <details
      data-testid="technical-setup-details"
      className="group rounded-xl border border-border-default bg-surface-2 p-4"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-text-secondary hover:text-text-primary">
        <span className="inline-flex items-center gap-1.5">
          <Code className="h-3.5 w-3.5" />
          Technical & setup details
        </span>
        <ChevronDown className="h-4 w-4 text-text-ghost transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-4 space-y-5">
        <SetupDetails access={access} />

        <section className="space-y-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
            Protocol details
          </p>

          {access.map((item) => {
            const typeNames = Object.keys(item.permission.protocolDefinition.types ?? {});
            const encryptedTypeCount = getEncryptedTypeCount(item.permission.protocolDefinition);
            const protocolJson = JSON.stringify(item.permission.protocolDefinition, null, 2);

            return (
              <div key={item.protocolUri} className="space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {item.isKnownProtocol ? item.name : 'Custom protocol'}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={item.protocolUri}>
                    {item.protocolUri}
                  </p>
                </div>

                <dl className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="text-text-ghost">Types</dt>
                    <dd className="mt-1 text-text-primary">{pluralize(typeNames.length, 'type')}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-text-ghost">Record paths</dt>
                    <dd className="mt-1 text-text-primary">{pluralize(item.paths.length, 'path')}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-text-ghost">Encrypted types</dt>
                    <dd className="mt-1 text-text-primary">{pluralize(encryptedTypeCount, 'type')}</dd>
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

                {item.paths.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs text-text-ghost">Record paths</p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.paths.map((path) => (
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

                <div>
                  <p className="mb-1.5 text-xs text-text-ghost">Granted scopes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.permission.permissionScopes.map((scope, index) => (
                      <span
                        key={`${scope.interface}.${scope.method}.${index}`}
                        className="rounded-full border border-border-subtle px-2 py-0.5 font-mono text-[10px] text-text-secondary"
                      >
                        {scope.interface}.{scope.method}
                      </span>
                    ))}
                  </div>
                </div>

                <pre className="max-h-72 overflow-auto rounded-md bg-surface-1 p-3 font-mono text-[11px] leading-relaxed text-text-tertiary">
                  {protocolJson}
                </pre>
              </div>
            );
          })}
        </section>
      </div>
    </details>
  );
}

export function PermissionDisplay({
  permissions,
  protocolSetupStatuses,
  existingSessionCount = 0,
  requesterLabel,
  sessionDurationSeconds,
  onRetryProtocolSetup,
}: PermissionDisplayProps) {
  if (permissions.length === 0) return null;

  const access = getProtocolAccess(permissions, protocolSetupStatuses);

  return (
    <div className="space-y-4">
      <AccessRows access={access} requesterLabel={requesterLabel} />
      <ProtocolConflictNotice access={access} />
      <ProtocolSetupUnavailableNotice access={access} onRetry={onRetryProtocolSetup} />
      <SessionTerms
        existingSessionCount={existingSessionCount}
        sessionDurationSeconds={sessionDurationSeconds}
      />
      <TechnicalDetails access={access} />
    </div>
  );
}
