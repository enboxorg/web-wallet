/**
 * Permission display for DWeb Connect consent screens.
 *
 * Keeps the primary surface focused on consent:
 * - what the requester can do
 * - how long access lasts
 * - where setup/module mechanics can be inspected
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
  Share2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConnectPermissionRequest } from '@enbox/connect';
import type { ModuleSetupStatus } from '@/features/connect/module-install';
import {
  formatConnectSessionDuration,
  getConnectSessionDurationOptions,
  resolveConnectSessionDurationSeconds,
} from '@/features/connect/connect-session-duration';
import {
  getModuleInfo,
  isCanonicalModuleDefinition,
  isContextCompanionDefinition,
} from '@/lib/module-names';
import { Select } from '@/components/ui/Select';
import {
  formatActionPhrase,
  formatModuleObjectPhrase,
  getDisplayScopes,
  getHighestPermissionRisk,
  getPermissionActions,
  groupPermissionRequestsWithCompanions,
  isInternalConnectScope,
  mergePermissionRequestsByModule,
} from './connect-scope-display';
import type { DisplayScope, PermissionAction, PermissionRisk } from './connect-scope-display';

interface PermissionDisplayProps {
  /** The permission requests from the dapp. */
  permissions: ConnectPermissionRequest[];
  /** Setup status keyed by module URI. */
  moduleSetupStatuses?: Record<string, ModuleSetupStatus>;
  /** Number of active matching sessions for this app + identity. */
  existingSessionCount?: number;
  /** Trust anchor shown in section copy, usually the verified origin. */
  requesterLabel?: string;
  /** Wallet-approved connect session lifetime. */
  sessionDurationSeconds?: number;
  /** Requester-proposed upper bound for the approved session. */
  requestedSessionTtlSeconds?: number;
  /** Change the wallet-approved connect session lifetime. */
  onSessionDurationSecondsChange?: (seconds: number) => void;
  /** Retry a failed module setup check. */
  onRetryModuleSetup?: () => void;
  /** Whether the owner has opted into replacing conflicting custom definitions. */
  overrideAcknowledged?: boolean;
  /** Toggle the override opt-in for definition conflicts. */
  onOverrideAcknowledgedChange?: (value: boolean) => void;
  /** Render session terms as a renewal rather than a first approval. */
  renewal?: boolean;
}

type ModuleDefinition = ConnectPermissionRequest['moduleDefinition'];

type ModuleAccess = {
  permission: ConnectPermissionRequest;
  moduleUri: string;
  name: string;
  description: string;
  isKnownModule: boolean;
  isContextCompanion: boolean;
  displayScopes: DisplayScope[];
  paths: string[];
  hasEncryptedTypes: boolean;
  sharesDecryptionKeys: boolean;
  setupStatus: ModuleSetupStatus;
};

type SetupStatusDisplay = {
  label: string;
};

const SETUP_STATUS_DISPLAY: Record<ModuleSetupStatus, SetupStatusDisplay> = {
  checking: {
    label : 'Checking',
  },
  configured: {
    label : 'Already ready',
  },
  conflict: {
    label : 'Blocked',
  },
  override: {
    label : 'Version conflict',
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

function moduleUriLabel(uri: string): string {
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
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = value as Record<string, unknown>;
      if (child.$ref === undefined) paths.push(path);
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

function getEncryptedTypeCount(moduleDefinition: ModuleDefinition): number {
  return Object.values(moduleDefinition.types ?? {})
    .filter(isEncryptedType)
    .length;
}

function getModuleAccess(
  permissions: ConnectPermissionRequest[],
  moduleSetupStatuses?: Record<string, ModuleSetupStatus>,
): ModuleAccess[] {
  return mergePermissionRequestsByModule(permissions).map((permission) => {
    const moduleUri = permission.moduleDefinition.module;
    const isContextCompanion = isContextCompanionDefinition(permission.moduleDefinition);
    const info = isContextCompanion ? undefined : getModuleInfo(moduleUri);
    const paths = collectStructurePaths(
      permission.moduleDefinition.structure as Record<string, unknown> | undefined,
    );
    const hasEncryptedTypes = Object.values(permission.moduleDefinition.types ?? {})
      .some(isEncryptedType);
    const isKnownModule = !isContextCompanion && isCanonicalModuleDefinition(permission.moduleDefinition);

    return {
      permission,
      moduleUri,
      name: isContextCompanion ? 'Shared contexts companion' : info!.name,
      description: isContextCompanion
        ? 'Open invitation inbox and encrypted followed-context journal'
        : info!.description,
      isKnownModule,
      isContextCompanion,
      displayScopes: getDisplayScopes(permission.permissionScopes),
      paths,
      hasEncryptedTypes,
      sharesDecryptionKeys: permission.permissionScopes.some((scope) =>
        scope.interface === 'Records' && scope.method === 'Read'
      ),
      setupStatus: moduleSetupStatuses?.[moduleUri] ?? 'checking',
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

function formatAccessSentence(item: ModuleAccess): string {
  const actions = getPermissionActions(item.displayScopes);
  const objectLabel = formatModuleObjectPhrase({
    isContextCompanion : item.isContextCompanion,
    isKnownModule      : item.isKnownModule,
    moduleName         : item.name,
  });
  return `${capitalize(formatActionPhrase(actions))} ${objectLabel}`;
}

function moduleTitleLabel(item: ModuleAccess): string {
  if (item.isKnownModule || item.isContextCompanion) {
    return item.name;
  }
  return 'Custom module';
}

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 active session' : `${count} active sessions`;
}

type AccessRowGroup = {
  primary: ModuleAccess;
  companion?: ModuleAccess;
};

function buildAccessRowGroups(access: ModuleAccess[]): AccessRowGroup[] {
  const byUri = new Map(access.map((item) => [item.moduleUri, item]));
  const groups = groupPermissionRequestsWithCompanions(access.map((item) => item.permission));
  return groups.map((group) => ({
    primary   : byUri.get(group.permission.moduleDefinition.module)!,
    companion : group.companion
      ? byUri.get(group.companion.moduleDefinition.module)
      : undefined,
  }));
}

function groupSharesDecryptionKeys({ primary, companion }: AccessRowGroup): boolean {
  return (primary.hasEncryptedTypes && primary.sharesDecryptionKeys)
    || Boolean(companion?.hasEncryptedTypes && companion.sharesDecryptionKeys);
}

function splitConnectScopes(permissionScopes: ConnectPermissionRequest['permissionScopes']): {
  hasPrimaryScopes: boolean;
  supportScopes: ConnectPermissionRequest['permissionScopes'];
} {
  return {
    supportScopes    : permissionScopes.filter(isInternalConnectScope),
    hasPrimaryScopes : permissionScopes.some((scope) => !isInternalConnectScope(scope)),
  };
}

function ActionBadges({
  actions,
  compact = false,
}: {
  actions: PermissionAction[];
  compact?: boolean;
}) {
  const pillSizing = compact ? 'px-2 py-0.5 text-[11px]' : 'px-2 py-1 text-xs';
  return (
    <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
      {actions.map((action) => (
        <span
          key={action.key}
          className={`inline-flex items-center rounded-full border ${pillSizing} font-medium ${actionBadgeClasses(action.risk)}`}
          title={action.label}
        >
          {action.label}
        </span>
      ))}
    </div>
  );
}

function CompanionAccessCallout({
  companion,
  companionActions,
  primaryActions,
}: {
  companion: ModuleAccess;
  companionActions: PermissionAction[];
  primaryActions: PermissionAction[];
}) {
  const { hasPrimaryScopes, supportScopes } = splitConnectScopes(companion.permission.permissionScopes);
  const actionsDiffer = companionActions.length > 0
    && companionActions.map((action) => action.key).join(',') !== primaryActions.map((action) => action.key).join(',');

  return (
    <div className="mt-3 rounded-lg border border-border-subtle bg-surface-1 px-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-text-primary">
              Shared contexts &amp; invitations
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
              {capitalize(formatActionPhrase(companionActions))} shared context invitations and your encrypted followed-context list.
            </p>
            <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={companion.moduleUri}>
              Companion module: {moduleUriLabel(companion.moduleUri)}
            </p>
          </div>
        </div>

        {actionsDiffer && <ActionBadges actions={companionActions} compact />}
      </div>
      {hasPrimaryScopes && supportScopes.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-text-ghost">
          Companion grants: {supportScopes.map((scope) => `${scope.interface}.${scope.method}`).join(', ')}.
        </p>
      )}
    </div>
  );
}

function AccessRows({
  access,
  requesterLabel = 'this app',
}: {
  access: ModuleAccess[];
  requesterLabel?: string;
}) {
  const requesterSentenceLabel = hostLabel(requesterLabel);
  const rowGroups = buildAccessRowGroups(access);
  const showSharedEncryptedNote = rowGroups.filter(groupSharesDecryptionKeys).length > 1;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
        What {requesterSentenceLabel} will be able to do
      </p>

      <div className="overflow-hidden rounded-xl border border-border-default bg-surface-2">
        {rowGroups.length === 0 && (
          <p className="px-4 py-3 text-sm text-text-secondary">No record or message access is requested.</p>
        )}
        {rowGroups.map((group, index) => {
          const { primary: item, companion } = group;
          const actions = getPermissionActions(item.displayScopes);
          const companionActions = companion ? getPermissionActions(companion.displayScopes) : [];
          const risk = getHighestPermissionRisk([...actions, ...companionActions]);
          const { hasPrimaryScopes, supportScopes } = splitConnectScopes(item.permission.permissionScopes);
          const rowHasEncryptedTypes = item.hasEncryptedTypes || Boolean(companion?.hasEncryptedTypes);
          const rowSharesKeys = groupSharesDecryptionKeys(group);

          return (
            <div
              key={item.moduleUri}
              className={`border-l-2 px-4 py-3 ${rowRiskClasses(risk)} ${index > 0 ? 'border-t border-t-border-subtle' : ''}`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatAccessSentence(item)}
                  </p>
                  {(item.isKnownModule || item.isContextCompanion) && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                      {item.description}
                    </p>
                  )}
                  {item.isContextCompanion && (
                    <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={item.moduleUri}>
                      Companion module: {moduleUriLabel(item.moduleUri)}
                    </p>
                  )}
                  {!item.isKnownModule && !item.isContextCompanion && (
                    <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={item.moduleUri}>
                      Custom module: {moduleUriLabel(item.moduleUri)}
                    </p>
                  )}
                </div>

                {actions.length > 1 && <ActionBadges actions={actions} />}
              </div>

              {companion && (
                <CompanionAccessCallout
                  companion={companion}
                  companionActions={companionActions}
                  primaryActions={actions}
                />
              )}

              {rowHasEncryptedTypes && rowSharesKeys && !showSharedEncryptedNote && (
                <p className="mt-2 inline-flex items-start gap-1.5 text-xs leading-relaxed text-text-secondary">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Approval permanently shares decryption keys for this scope. Expiry stops authorized DWN access, but matching ciphertext obtained now or later can still be decrypted.
                  </span>
                </p>
              )}
              {rowHasEncryptedTypes && !rowSharesKeys && (
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
  requestedSessionTtlSeconds,
  onSessionDurationSecondsChange,
  renewal,
}: {
  existingSessionCount: number;
  sessionDurationSeconds?: number;
  requestedSessionTtlSeconds?: number;
  onSessionDurationSecondsChange?: (seconds: number) => void;
  renewal?: boolean;
}) {
  const durationSeconds = resolveConnectSessionDurationSeconds(sessionDurationSeconds);
  const durationLabel = formatConnectSessionDuration(durationSeconds);
  const durationOptions = getConnectSessionDurationOptions(requestedSessionTtlSeconds);

  return (
    <section className="rounded-xl border border-border-default bg-surface-2 p-4">
      <div className="flex items-start gap-3">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary">
            {renewal ? `New access period: ${durationLabel}` : `Access lasts ${durationLabel}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            It expires automatically. You can revoke it later from this profile&apos;s Permissions tab.
          </p>
        </div>
      </div>

      {onSessionDurationSecondsChange && durationOptions.length > 1 && (
        <div className="mt-3">
          <Select
            id="connect-session-duration"
            label="Access duration"
            options={durationOptions.map((option) => ({
              value : String(option.value),
              label : option.label,
            }))}
            value={String(durationSeconds)}
            onChange={(event) => onSessionDurationSecondsChange(Number(event.target.value))}
          />
        </div>
      )}

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

function SetupStatusBadge({ status }: { status: ModuleSetupStatus }) {
  const display = SETUP_STATUS_DISPLAY[status];
  const classes = status === 'conflict'
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : status === 'override'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
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
  items: ModuleAccess[];
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
                key={item.moduleUri}
                className="flex flex-col gap-1 rounded-md bg-surface-2 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-primary">
                    {moduleTitleLabel(item)}
                  </p>
                  {!item.isKnownModule && (
                    <p className="truncate font-mono text-[10px] text-text-ghost" title={item.moduleUri}>
                      {moduleUriLabel(item.moduleUri)}
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

function SetupDetails({ access }: { access: ModuleAccess[] }) {
  const setupChanges = access.filter((item) => item.setupStatus === 'install');
  const encryptionUpgrades = access.filter((item) => item.setupStatus === 'upgrade');
  const overrides = access.filter((item) => item.setupStatus === 'override');
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
          Module setup controls record authorization. New policies are installed before the app grant; an existing policy is only replaced when you explicitly override it below. Dependencies listed only for setup do not grant the app access to their records or messages.
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
        icon={RefreshCw}
        title="Will replace on override"
        summary="Already installed with a different definition. With your explicit consent below, the wallet replaces it with this app's version."
        items={overrides}
      />
      <SetupDetailGroup
        icon={AlertTriangle}
        title="Setup conflict"
        summary="The wallet will not replace an existing owner module during a connection."
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

function ModuleConflictNotice({ access }: { access: ModuleAccess[] }) {
  if (!access.some((item) => item.setupStatus === 'conflict')) return null;

  return (
    <section role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
        <div>
          <p className="text-sm font-medium text-red-200">Module setup conflict</p>
          <p className="mt-1 text-xs leading-relaxed text-red-200/80">
            A requested module conflicts with this profile&apos;s protected or invalid setup and can&apos;t be approved. The wallet will not replace a core module during a connection.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Overridable definition conflict: a custom module installed with a different
 * definition. Unlike a hard conflict, the owner may consent to replacing it. The
 * opt-in checkbox is controlled by the parent, which gates approval on it and
 * then runs the owner reconfigure before the connect ceremony.
 */
function ModuleOverrideNotice({
  access,
  overrideAcknowledged,
  onOverrideAcknowledgedChange,
}: {
  access: ModuleAccess[];
  overrideAcknowledged: boolean;
  onOverrideAcknowledgedChange?: (value: boolean) => void;
}) {
  const overrides = access.filter((item) => item.setupStatus === 'override');
  if (overrides.length === 0) return null;

  const many = overrides.length > 1;

  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-200">
            {pluralize(overrides.length, 'module')} installed with a different definition
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-200/80">
            This app asks to use a changed version of {many ? 'modules' : 'a module'} you already
            have installed. Approving replaces your installed definition with the app&apos;s version on
            this profile and its DWN endpoints. The change is kept even if the rest of the connection
            fails.
          </p>
          <ul className="mt-2 space-y-1">
            {overrides.map((item) => (
              <li
                key={item.moduleUri}
                className="min-w-0 truncate font-mono text-[10px] text-amber-200/70"
                title={item.moduleUri}
              >
                {moduleUriLabel(item.moduleUri)}
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-amber-100">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
              checked={overrideAcknowledged}
              onChange={(event) => onOverrideAcknowledgedChange?.(event.target.checked)}
            />
            <span>
              Replace my installed module {many ? 'definitions' : 'definition'} with this app&apos;s version.
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}

function ModuleSetupUnavailableNotice({
  access,
  onRetry,
}: {
  access: ModuleAccess[];
  onRetry?: () => void;
}) {
  if (!access.some((item) => item.setupStatus === 'unavailable')) return null;

  return (
    <section role="alert" className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-warning">Module setup could not be verified</p>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            Approval remains blocked until the wallet can check the selected profile&apos;s local module state.
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

function TechnicalDetails({ access }: { access: ModuleAccess[] }) {
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
            Module details
          </p>

          {access.map((item) => {
            const typeNames = Object.keys(item.permission.moduleDefinition.types ?? {});
            const encryptedTypeCount = getEncryptedTypeCount(item.permission.moduleDefinition);
            const moduleJson = JSON.stringify(item.permission.moduleDefinition, null, 2);

            return (
              <div key={item.moduleUri} className="space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {moduleTitleLabel(item)}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={item.moduleUri}>
                    {item.moduleUri}
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
                  {item.permission.permissionScopes.length === 0 && (
                    <p className="text-xs text-text-secondary">None. This module is included only for setup.</p>
                  )}
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
                  {moduleJson}
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
  moduleSetupStatuses,
  existingSessionCount = 0,
  requesterLabel,
  sessionDurationSeconds,
  requestedSessionTtlSeconds,
  onSessionDurationSecondsChange,
  onRetryModuleSetup,
  overrideAcknowledged = false,
  onOverrideAcknowledgedChange,
  renewal,
}: PermissionDisplayProps) {
  if (permissions.length === 0) return null;

  const access = getModuleAccess(permissions, moduleSetupStatuses);

  return (
    <div className="space-y-4">
      <AccessRows access={access.filter(item => item.permission.permissionScopes.length > 0)} requesterLabel={requesterLabel} />
      <ModuleConflictNotice access={access} />
      <ModuleOverrideNotice
        access={access}
        overrideAcknowledged={overrideAcknowledged}
        onOverrideAcknowledgedChange={onOverrideAcknowledgedChange}
      />
      <ModuleSetupUnavailableNotice access={access} onRetry={onRetryModuleSetup} />
      <SessionTerms
        existingSessionCount={existingSessionCount}
        sessionDurationSeconds={sessionDurationSeconds}
        requestedSessionTtlSeconds={requestedSessionTtlSeconds}
        onSessionDurationSecondsChange={onSessionDurationSecondsChange}
        renewal={renewal}
      />
      <TechnicalDetails access={access} />
    </div>
  );
}
