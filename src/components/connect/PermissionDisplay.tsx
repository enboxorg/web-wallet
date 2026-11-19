/**
 * Permission display for DWeb Connect consent screens.
 *
 * Keeps the primary surface focused on consent:
 * - what the requester can do (one row per data type, one chip per action)
 * - how long access lasts
 * - where setup/module mechanics can be inspected
 *
 * Trust rule: curated names, descriptions and icons are used only for pinned,
 * matching wallet module definitions. Every other module is named from its own
 * URI and always shown with the host that namespaces it, so the name reads as
 * "what <host> calls this data", never as a wallet-vouched label. Modules are
 * keyed by URI, not name, so every unpinned module is tagged Third-party.
 */
import { useId } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Code,
  Download,
  History,
  Loader2,
  Lock,
  LockKeyhole,
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
  describeModule,
  getContextCompanionRootUri,
  getModuleInfo,
  getModuleName,
  isCanonicalModuleDefinition,
  isContextCompanionDefinition,
  nameFromModuleUri,
  type ModuleDisplay,
} from '@/lib/module-names';
import { collectStructurePaths, isEncryptedType } from '@/lib/module-structure';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Disclosure } from '@/components/ui/Disclosure';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ModuleGlyph } from '@/components/modules/ModuleGlyph';
import {
  getSortedPermissionActions,
  groupPermissionRequestsWithCompanions,
  hidesSupportActions,
  mergePermissionRequestsByModule,
  visibleActions,
} from './connect-scope-display';
import { PermissionActionChips, SupportActionsNote } from './PermissionActionChips';
import { ConsentNotice } from './ConsentLayout';

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
  /**
   * Show the access as separate titled lists (e.g. new access, then renewed
   * access) instead of one. Setup, terms and technical details still cover
   * all of `permissions`.
   */
  accessSections?: AccessSection[];
}

export interface AccessSection {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  permissions: ConnectPermissionRequest[];
}

type ModuleAccess = {
  permission: ConnectPermissionRequest;
  moduleUri: string;
  /** Curated name for pinned modules; otherwise named from the URI itself. */
  name: string;
  /** Curated description for pinned modules; otherwise the URI's host. */
  detail: string;
  /** Glyph facts: core icons only for pinned, matching definitions. */
  glyph: ModuleDisplay;
  isKnownModule: boolean;
  isContextCompanion: boolean;
  paths: string[];
  hasEncryptedTypes: boolean;
  sharesDecryptionKeys: boolean;
  setupStatus: ModuleSetupStatus;
};

const SETUP_STATUS_LABELS: Record<ModuleSetupStatus, string> = {
  checking    : 'Checking',
  configured  : 'Already ready',
  conflict    : 'Blocked',
  override    : 'Version conflict',
  install     : 'Will add',
  upgrade     : 'Encryption upgrade',
  unavailable : 'Needs verification',
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
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

function getModuleAccess(
  permissions: ConnectPermissionRequest[],
  moduleSetupStatuses?: Record<string, ModuleSetupStatus>,
): ModuleAccess[] {
  return mergePermissionRequestsByModule(permissions).map((permission) => {
    const definition = permission.moduleDefinition;
    const moduleUri = definition.module;
    const isContextCompanion = isContextCompanionDefinition(definition);
    const isKnownModule = !isContextCompanion && isCanonicalModuleDefinition(definition);
    const info = isKnownModule ? getModuleInfo(moduleUri) : undefined;
    const companionRoot = isContextCompanion ? getContextCompanionRootUri(moduleUri) : undefined;
    const display = describeModule(moduleUri, definition);
    // A verified companion is labelled by its root (plus a "Shared contexts"
    // tag); anything else unpinned is named from its own URI.
    const name = info?.name
      ?? (companionRoot ? getModuleName(companionRoot) : nameFromModuleUri(moduleUri));

    return {
      permission,
      moduleUri,
      name,
      detail : info?.description ?? display.host ?? display.shortUri,
      glyph  : { ...display, name, isCore: isKnownModule },
      isKnownModule,
      isContextCompanion,
      paths: collectStructurePaths(
        permission.moduleDefinition.structure as Record<string, unknown> | undefined,
      ),
      hasEncryptedTypes: Object.values(permission.moduleDefinition.types ?? {}).some(isEncryptedType),
      sharesDecryptionKeys: permission.permissionScopes.some((scope) =>
        scope.interface === 'Records' && scope.method === 'Read'
      ),
      setupStatus: moduleSetupStatuses?.[moduleUri] ?? 'checking',
    };
  });
}

function itemActions(item: ModuleAccess) {
  return getSortedPermissionActions(item.permission.permissionScopes.map((scope) => ({
    interface : scope.interface,
    method    : scope.method,
  })));
}

function shownActions(item: ModuleAccess) {
  return visibleActions(itemActions(item));
}

function hidesSupport(item: ModuleAccess): boolean {
  return hidesSupportActions(itemActions(item));
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

function sharesKeys(item: ModuleAccess | undefined): boolean {
  return Boolean(item?.hasEncryptedTypes && item.sharesDecryptionKeys);
}

const SHARED_CONTEXTS_HINT = 'Invitations others send you, and your encrypted list of followed contexts.';
const THIRD_PARTY_HINT = 'Not built into the wallet. A module is identified by its URI, not its name.';

function Dot() {
  return <span aria-hidden="true" className="text-text-ghost">·</span>;
}

/**
 * "Encrypted" as words in a row's details line, amber when approving shares
 * the decryption keys. The notice under the list explains what that means.
 */
function EncryptedNote({ keysShared }: { keysShared: boolean }) {
  const explanation = keysShared
    ? 'Approving shares its decryption keys.'
    : 'This approval does not share private decryption keys.';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1', keysShared ? 'text-warning' : 'text-text-tertiary')}
      title={`Stored encrypted. ${explanation}`}
    >
      <LockKeyhole className="size-3" aria-hidden="true" />
      Encrypted<span className="sr-only">. {explanation}</span>
    </span>
  );
}

/**
 * One quiet line under the name. For a module named from its own URI the
 * host leads, so provenance is read first; "Third-party" says it isn't one of
 * the wallet's built-in definitions. Plain words, not pills.
 */
function AccessItemMeta({ item }: { item: ModuleAccess }) {
  if (item.isKnownModule) {
    return (
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-text-tertiary">
        {item.hasEncryptedTypes && (
          <>
            <EncryptedNote keysShared={sharesKeys(item)} />
            <Dot />
          </>
        )}
        <span className="min-w-0 truncate" title={item.detail}>{item.detail}</span>
      </p>
    );
  }

  // The host is the provenance of a name the requester chose, so it never
  // truncates: on a narrow screen the tags wrap below it instead.
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-tertiary">
      <span className="break-all text-text-secondary" title={item.moduleUri}>{item.detail}</span>
      <span className="inline-flex flex-wrap items-center gap-x-1.5">
        <span title={THIRD_PARTY_HINT}>Third-party</span>
        {item.isContextCompanion && (
          <>
            <Dot />
            <span title={SHARED_CONTEXTS_HINT}>Shared contexts</span>
          </>
        )}
        {item.hasEncryptedTypes && (
          <>
            <Dot />
            <EncryptedNote keysShared={sharesKeys(item)} />
          </>
        )}
      </span>
    </p>
  );
}

/** A verified contexts companion, folded into its root module's row. */
function CompanionAccess({ companion }: { companion: ModuleAccess }) {
  return (
    <div
      role="group"
      aria-label="Shared contexts & invitations"
      className="mt-3 rounded-lg bg-surface-2/70 px-3 py-2.5"
    >
      <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
        <Share2 className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="font-medium text-text-secondary" title={SHARED_CONTEXTS_HINT}>Shared contexts</span>
        {companion.hasEncryptedTypes && (
          <>
            <Dot />
            <EncryptedNote keysShared={sharesKeys(companion)} />
          </>
        )}
      </p>
      <PermissionActionChips actions={shownActions(companion)} className="mt-1.5" />
    </div>
  );
}

/** Name, then provenance, then what the app may do: three quiet lines. */
function AccessItem({ group }: { group: AccessRowGroup }) {
  const titleId = useId();
  const { primary: item, companion } = group;
  const actions = shownActions(item);
  const hasRecordAccess = actions.some((action) => action.kind === 'record');

  return (
    <li aria-labelledby={titleId} className="flex items-start gap-3 px-4 py-3.5">
      <ModuleGlyph module={item.glyph} size="sm" />
      <div className="min-w-0 flex-1">
        <p id={titleId} className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
        <AccessItemMeta item={item} />
        <PermissionActionChips
          actions={actions}
          emphasizeSupport={!hasRecordAccess}
          className="mt-2"
        />
        {companion && <CompanionAccess companion={companion} />}
      </div>
    </li>
  );
}

/** Notes that apply to the whole list, shown once under it. */
function AccessNotes({ access }: { access: ModuleAccess[] }) {
  return (
    <>
      <SupportActionsNote
        names={[...new Set(access.filter(hidesSupport).map((item) => item.name))]}
        all={access.every(hidesSupport)}
      />
      <KeySharingNotice access={access} />
    </>
  );
}

function KeySharingNotice({ access }: { access: ModuleAccess[] }) {
  const keySharingGroups = buildAccessRowGroups(access)
    .filter((group) => sharesKeys(group.primary) || sharesKeys(group.companion));
  if (keySharingGroups.length === 0) return null;

  return (
    <ConsentNotice tone="warning" icon={<Lock />}>
      Approval shares decryption keys for {keySharingGroups.length > 1 ? 'these scopes' : 'this scope'}.
      {' '}Expiry stops authorized DWN access, but matching ciphertext obtained now or later can still be decrypted.
    </ConsentNotice>
  );
}

function AccessRows({
  access,
  heading,
  description,
  showNotes = true,
  prominent = false,
}: {
  access: ModuleAccess[];
  heading: React.ReactNode;
  description?: React.ReactNode;
  showNotes?: boolean;
  /** Section titles that must not be skimmed past, e.g. "New access". */
  prominent?: boolean;
}) {
  const headingId = useId();
  const rowGroups = buildAccessRowGroups(access);

  return (
    <section className="space-y-2.5" aria-labelledby={headingId}>
      <div>
        <h2
          id={headingId}
          className={prominent ? 'text-sm font-semibold text-text-primary' : 'text-[13px] font-medium text-text-secondary'}
        >
          {heading}
        </h2>
        {description && <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>}
      </div>

      <ul className="surface-card divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-default bg-surface-1">
        {rowGroups.length === 0 && (
          <li className="px-4 py-3 text-sm text-text-secondary">No record or message access is requested.</li>
        )}
        {rowGroups.map((group) => <AccessItem key={group.primary.moduleUri} group={group} />)}
      </ul>

      {showNotes && <AccessNotes access={access} />}
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
  const canChoose = onSessionDurationSecondsChange !== undefined && durationOptions.length > 1;

  return (
    <section className="surface-card rounded-xl border border-border-default bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-secondary ring-1 ring-inset ring-border-subtle">
          <Clock3 className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            {renewal ? `New access period: ${durationLabel}` : `Access lasts ${durationLabel}`}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
            It expires automatically. You can revoke it later from this profile&apos;s Apps &amp; Permissions tab.
          </p>
        </div>
      </div>

      {canChoose && (
        <SegmentedControl
          label="Access duration"
          className="mt-3.5"
          options={durationOptions}
          value={durationSeconds}
          onChange={onSessionDurationSecondsChange}
        />
      )}

      {existingSessionCount > 0 && (
        <p className="mt-3.5 flex items-start gap-2 border-t border-border-subtle pt-3 text-xs leading-relaxed text-text-tertiary">
          <History className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            This requester already has {pluralize(existingSessionCount, 'active session')} for this profile.
            Approving creates a separate session with {durationLabel} of access.
          </span>
        </p>
      )}
    </section>
  );
}

function SetupStatusBadge({ status }: { status: ModuleSetupStatus }) {
  const tone = status === 'conflict' ? 'danger' : status === 'override' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{SETUP_STATUS_LABELS[status]}</Badge>;
}

function moduleSetupTitle(item: ModuleAccess): string {
  return item.isContextCompanion ? `${item.name} shared contexts` : item.name;
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
        <Icon className="mt-0.5 size-4 shrink-0 text-text-tertiary" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-text-primary">{title}</p>
            <span className="text-[11px] text-text-ghost">{pluralize(items.length, 'item')}</span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{summary}</p>

          <ul className="mt-2 space-y-1.5">
            {items.map((item) => (
              <li
                key={item.moduleUri}
                className="flex flex-col gap-1 rounded-md bg-surface-2 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs text-text-primary">{moduleSetupTitle(item)}</p>
                  {!item.isKnownModule && (
                    <p className="truncate font-mono text-[10px] text-text-ghost" title={item.moduleUri}>
                      {moduleUriLabel(item.moduleUri)}
                    </p>
                  )}
                </div>
                <SetupStatusBadge status={item.setupStatus} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SetupDetails({ access }: { access: ModuleAccess[] }) {
  const by = (status: ModuleSetupStatus) => access.filter((item) => item.setupStatus === status);
  const setupChecks = access.filter((item) =>
    item.setupStatus === 'checking' || item.setupStatus === 'unavailable'
  );

  return (
    <section className="space-y-2">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Wallet setup</p>
        <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
          Module setup controls record authorization. New policies are installed before the app grant; an existing policy is only replaced when you explicitly override it below. Dependencies listed only for setup do not grant the app access to their records or messages.
        </p>
      </div>

      <SetupDetailGroup
        icon={Download}
        title="Will add setup"
        summary="The wallet installs this authorization policy before creating the grant."
        items={by('install')}
      />
      <SetupDetailGroup
        icon={Lock}
        title="Will upgrade encryption"
        summary="The authorization policy is unchanged; the wallet adds its current encryption keys."
        items={by('upgrade')}
      />
      <SetupDetailGroup
        icon={RefreshCw}
        title="Will replace on override"
        summary="Already installed with a different definition. With your explicit consent below, the wallet replaces it with this app's version."
        items={by('override')}
      />
      <SetupDetailGroup
        icon={AlertTriangle}
        title="Setup conflict"
        summary="The wallet will not replace an existing owner module during a connection."
        items={by('conflict')}
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
        items={by('configured')}
      />
    </section>
  );
}

function ModuleConflictNotice({ access }: { access: ModuleAccess[] }) {
  if (!access.some((item) => item.setupStatus === 'conflict')) return null;

  return (
    <ConsentNotice role="alert" tone="error" title="Module setup conflict">
      A requested module conflicts with this profile&apos;s protected or invalid setup and can&apos;t be approved. The wallet will not replace a core module during a connection.
    </ConsentNotice>
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
    <ConsentNotice
      tone="warning"
      icon={<RefreshCw />}
      title={`${pluralize(overrides.length, 'module')} installed with a different definition`}
    >
      <p>
        This app asks to use a changed version of {many ? 'modules' : 'a module'} you already
        have installed. Approving replaces your installed definition with the app&apos;s version on
        this profile and its DWN endpoints. The change is kept even if the rest of the connection
        fails.
      </p>
      <ul className="mt-2 space-y-1">
        {overrides.map((item) => (
          <li key={item.moduleUri} className="min-w-0 truncate font-mono text-[11px] text-text-tertiary" title={item.moduleUri}>
            {moduleUriLabel(item.moduleUri)}
          </li>
        ))}
      </ul>
      <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-warning/25 bg-surface-1 px-3 py-2.5 text-xs leading-relaxed text-text-primary">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-warning)]"
          checked={overrideAcknowledged}
          onChange={(event) => onOverrideAcknowledgedChange?.(event.target.checked)}
        />
        <span>
          Replace my installed module {many ? 'definitions' : 'definition'} with this app&apos;s version.
        </span>
      </label>
    </ConsentNotice>
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
    <ConsentNotice role="alert" tone="warning" title="Module setup could not be verified">
      <p>Approval remains blocked until the wallet can check the selected profile&apos;s local module state.</p>
      {onRetry && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 font-medium text-warning hover:underline"
          onClick={onRetry}
        >
          <RefreshCw className="size-3.5" />
          Retry check
        </button>
      )}
    </ConsentNotice>
  );
}

function TechnicalDetails({ access }: { access: ModuleAccess[] }) {
  return (
    <Disclosure
      data-testid="technical-setup-details"
      className="surface-card rounded-xl border border-border-default bg-surface-1"
      summaryClassName="px-4 py-3.5 text-text-tertiary hover:text-text-primary"
      summary={(
        <>
          <Code className="size-3.5" aria-hidden="true" />
          Technical &amp; setup details
        </>
      )}
      contentClassName="space-y-5 border-t border-border-subtle px-4 py-4"
    >
      <SetupDetails access={access} />

      <section className="space-y-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Module details</p>

        {access.map((item) => {
          const typeNames = Object.keys(item.permission.moduleDefinition.types ?? {});
          const encryptedTypeCount = Object.values(item.permission.moduleDefinition.types ?? {})
            .filter(isEncryptedType).length;
          const moduleJson = JSON.stringify(item.permission.moduleDefinition, null, 2);

          return (
            <div key={item.moduleUri} className="space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
              <div>
                <p className="text-sm font-medium text-text-primary">{moduleSetupTitle(item)}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-text-ghost" title={item.moduleUri}>
                  {item.moduleUri}
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-xs">
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
                      <Badge key={typeName} variant="outline" className="font-mono">{typeName}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {item.paths.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-text-ghost">Record paths</p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.paths.map((path) => (
                      <Badge key={path} variant="outline" className="font-mono">{path}</Badge>
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
                    <Badge
                      key={`${scope.interface}.${scope.method}.${index}`}
                      variant="outline"
                      className="font-mono"
                    >
                      {scope.interface}.{scope.method}
                    </Badge>
                  ))}
                </div>
              </div>

              <pre
                tabIndex={0}
                aria-label={`${moduleSetupTitle(item)} definition`}
                className="max-h-72 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {moduleJson}
              </pre>
            </div>
          );
        })}
      </section>
    </Disclosure>
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
  accessSections,
}: PermissionDisplayProps) {
  if (permissions.length === 0) return null;

  const access = getModuleAccess(permissions, moduleSetupStatuses);
  const withScopes = (items: ModuleAccess[]) => items.filter((item) => item.permission.permissionScopes.length > 0);
  const sections = accessSections
    ?.map((section) => ({ ...section, access: withScopes(getModuleAccess(section.permissions, moduleSetupStatuses)) }))
    .filter((section) => section.access.length > 0);

  return (
    <div className="space-y-4">
      {sections ? (
        <>
          {sections.map((section) => (
            <AccessRows
              key={section.id}
              access={section.access}
              heading={section.title}
              description={section.description}
              showNotes={false}
              prominent
            />
          ))}
          {/* One set of notes for everything being approved. */}
          <AccessNotes access={sections.flatMap((section) => section.access)} />
        </>
      ) : (
        <AccessRows
          access={withScopes(access)}
          heading={<>What {hostLabel(requesterLabel ?? 'this app')} will be able to do</>}
        />
      )}
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
