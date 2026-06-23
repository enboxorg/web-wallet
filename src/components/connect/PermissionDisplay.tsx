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
import { getProtocolInfo, isKnownProtocol } from '@/lib/protocol-names';
import type { ProtocolSetupStatus } from '@/features/connect/protocol-install';
import {
  formatActionPhrase,
  getDisplayScopes,
  getHighestPermissionRisk,
  getPermissionActions,
  mergePermissionRequestsByProtocol,
} from './connect-scope-display';
import type { DisplayScope, PermissionRisk } from './connect-scope-display';
import { CONNECT_SESSION_DURATION_LABEL } from './SessionExpiryNotice';

const CONNECT_SESSION_NOUN_LABEL = CONNECT_SESSION_DURATION_LABEL === '24 hours'
  ? '24-hour session'
  : `${CONNECT_SESSION_DURATION_LABEL} session`;

interface PermissionDisplayProps {
  /** The permission requests from the dapp. */
  permissions: ConnectPermissionRequest[];
  /** Setup status keyed by protocol URI. */
  protocolSetupStatuses?: Record<string, ProtocolSetupStatus>;
  /** Number of active matching sessions for this app + identity. */
  existingSessionCount?: number;
  /** Trust anchor shown in section copy, usually the verified origin. */
  requesterLabel?: string;
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
  install: {
    label : 'Will add',
  },
  update: {
    label : 'Will update',
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

    return {
      permission,
      protocolUri,
      name: info.name,
      description: info.description,
      isKnownProtocol: isKnownProtocol(protocolUri),
      displayScopes: getDisplayScopes(permission.permissionScopes),
      paths,
      hasEncryptedTypes,
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
  const encryptedAccess = access.filter((item) => item.hasEncryptedTypes);
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

              {item.hasEncryptedTypes && !showSharedEncryptedNote && (
                <p className="mt-2 inline-flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Stored encrypted. Approval shares the keys needed for this app to read allowed data during this session.
                  </span>
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
            Some allowed data is stored encrypted. Approval shares the keys needed for this app to read allowed data during this session.
          </span>
        </p>
      )}
    </section>
  );
}

function SessionTerms({ existingSessionCount }: { existingSessionCount: number }) {
  return (
    <section className="rounded-xl border border-border-default bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            Access lasts {CONNECT_SESSION_DURATION_LABEL}
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
            Approving creates a separate {CONNECT_SESSION_NOUN_LABEL}.
          </p>
        </div>
      )}
    </section>
  );
}

function SetupStatusBadge({ status }: { status: ProtocolSetupStatus }) {
  const display = SETUP_STATUS_DISPLAY[status];

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-border-subtle bg-surface-1 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
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

function setupChangeTitle(items: ProtocolAccess[]): string {
  const hasInstall = items.some((item) => item.setupStatus === 'install');
  const hasUpdate = items.some((item) => item.setupStatus === 'update');

  if (hasInstall && hasUpdate) return 'Will add or update setup';
  if (hasUpdate) return 'Will update setup';
  return 'Will add setup';
}

function SetupDetails({ access }: { access: ProtocolAccess[] }) {
  const setupChanges = access.filter((item) =>
    item.setupStatus === 'install'
    || item.setupStatus === 'update'
  );
  const setupChecks = access.filter((item) =>
    item.setupStatus === 'checking'
    || item.setupStatus === 'unavailable'
  );
  const ready = access.filter((item) => item.setupStatus === 'configured');
  const hasUpdate = setupChanges.some((item) => item.setupStatus === 'update');

  return (
    <section className="space-y-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
          Wallet setup
        </p>
        <p className="mt-1 text-xs leading-relaxed text-text-secondary">
          Setup is wallet housekeeping. It does not add permissions beyond the access listed above.
        </p>
      </div>

      <SetupDetailGroup
        icon={hasUpdate ? RefreshCw : Download}
        title={setupChangeTitle(setupChanges)}
        summary="The wallet prepares these before creating the grant."
        items={setupChanges}
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
}: PermissionDisplayProps) {
  if (permissions.length === 0) return null;

  const access = getProtocolAccess(permissions, protocolSetupStatuses);

  return (
    <div className="space-y-4">
      <AccessRows access={access} requesterLabel={requesterLabel} />
      <SessionTerms existingSessionCount={existingSessionCount} />
      <TechnicalDetails access={access} />
    </div>
  );
}
