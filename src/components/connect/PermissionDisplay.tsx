/**
 * Permission display for DWeb Connect consent screens.
 *
 * Presents a compact, summary-first approval view:
 * - temporary session + setup + data-area summary
 * - grouped wallet setup plan
 * - user-facing access rows after setup context
 * - one collapsed technical detail section for protocol internals
 */
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Code,
  Database,
  Download,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConnectPermissionRequest, DwnPermissionScope } from '@enbox/agent';
import { getProtocolInfo, getScopeLabel, getScopeColor, type ScopeColor } from '@/lib/protocol-names';
import type { ProtocolSetupStatus } from '@/features/connect/protocol-install';
import { CONNECT_SESSION_DURATION_LABEL } from './SessionExpiryNotice';

const CONNECT_SESSION_SUMMARY_LABEL = CONNECT_SESSION_DURATION_LABEL === '24 hours'
  ? '24-hour session'
  : `${CONNECT_SESSION_DURATION_LABEL} session`;

interface PermissionDisplayProps {
  /** The permission requests from the dapp. */
  permissions: ConnectPermissionRequest[];
  /** Setup status keyed by protocol URI. */
  protocolSetupStatuses?: Record<string, ProtocolSetupStatus>;
  /** Number of active matching sessions for this app + identity. */
  existingSessionCount?: number;
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

type ProtocolAccess = {
  permission: ConnectPermissionRequest;
  protocolUri: string;
  name: string;
  description: string;
  displayScopes: Array<{ interface: string; method: string }>;
  paths: string[];
  hasEncryptedTypes: boolean;
  setupStatus: ProtocolSetupStatus;
};

type SetupTone = 'neutral' | 'success' | 'info' | 'warning';

type SetupStatusDisplay = {
  label: string;
  className: string;
};

const SETUP_STATUS_DISPLAY: Record<ProtocolSetupStatus, SetupStatusDisplay> = {
  checking: {
    label     : 'Checking',
    className : 'border-border-subtle bg-surface-1 text-text-secondary',
  },
  configured: {
    label     : 'Ready',
    className : 'border-green-500/20 bg-green-500/10 text-green-300',
  },
  install: {
    label     : 'Add',
    className : 'border-blue-500/20 bg-blue-500/10 text-blue-300',
  },
  update: {
    label     : 'Update',
    className : 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  },
  unavailable: {
    label     : 'Verify',
    className : 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  },
};

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
  return permissions.map((permission) => {
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
      displayScopes: getDisplayScopes(permission.permissionScopes),
      paths,
      hasEncryptedTypes,
      setupStatus: protocolSetupStatuses?.[protocolUri] ?? 'checking',
    };
  });
}

function getSetupSummary(access: ProtocolAccess[]): {
  label: string;
  tone: SetupTone;
  icon: LucideIcon;
  spin?: boolean;
} {
  const updates = access.filter((item) => item.setupStatus === 'update').length;
  const installs = access.filter((item) => item.setupStatus === 'install').length;
  const unavailable = access.filter((item) => item.setupStatus === 'unavailable').length;
  const checking = access.filter((item) => item.setupStatus === 'checking').length;

  if (updates > 0) {
    const parts = [
      installs > 0 ? `${installs} to add` : '',
      `${updates} to update`,
    ].filter(Boolean);

    return {
      label : `Setup: ${parts.join(', ')}`,
      tone  : 'warning',
      icon  : RefreshCw,
    };
  }
  if (installs > 0) {
    return {
      label : `Setup: ${installs} to add`,
      tone  : 'info',
      icon  : Download,
    };
  }
  if (unavailable > 0) {
    return {
      label : 'Setup check needed',
      tone  : 'warning',
      icon  : AlertTriangle,
    };
  }
  if (checking > 0) {
    return {
      label : 'Checking setup',
      tone  : 'neutral',
      icon  : Loader2,
      spin  : true,
    };
  }
  return {
    label : 'No setup changes',
    tone  : 'success',
    icon  : CheckCircle2,
  };
}

function summaryToneClasses(tone: SetupTone): string {
  switch (tone) {
    case 'success':
      return 'border-green-500/20 bg-green-500/10 text-green-300';
    case 'info':
      return 'border-blue-500/20 bg-blue-500/10 text-blue-300';
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/10 text-amber-300';
    default:
      return 'border-border-subtle bg-surface-1 text-text-secondary';
  }
}

function setupGroupClasses(tone: SetupTone): string {
  switch (tone) {
    case 'success':
      return 'border-green-500/20 bg-green-500/10';
    case 'info':
      return 'border-blue-500/20 bg-blue-500/10';
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/10';
    default:
      return 'border-border-default bg-surface-2';
  }
}

function setupIconClasses(tone: SetupTone): string {
  switch (tone) {
    case 'success':
      return 'bg-green-500/15 text-green-400';
    case 'info':
      return 'bg-blue-500/15 text-blue-400';
    case 'warning':
      return 'bg-amber-500/15 text-amber-400';
    default:
      return 'bg-surface-1 text-text-secondary';
  }
}

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 active session' : `${count} active sessions`;
}

function getScopeDisplayLabel(scope: { interface: string; method: string }): string {
  if (scope.interface !== 'Records') return getScopeLabel(scope);

  switch (scope.method) {
    case 'Read':
      return 'View';
    case 'Write':
      return 'Add or edit';
    case 'Delete':
      return 'Delete';
    default:
      return getScopeLabel(scope);
  }
}

function SummaryChip({
  icon: Icon,
  label,
  tone = 'neutral',
  spin,
}: {
  icon: LucideIcon;
  label: string;
  tone?: SetupTone;
  spin?: boolean;
}) {
  return (
    <div className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${summaryToneClasses(tone)}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${spin ? 'animate-spin' : ''}`} />
      <span>{label}</span>
    </div>
  );
}

function ConnectionSummary({
  access,
  existingSessionCount,
}: {
  access: ProtocolAccess[];
  existingSessionCount: number;
}) {
  const setup = getSetupSummary(access);

  return (
    <section className="rounded-xl border border-border-default bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
            Connection summary
          </p>
          <p className="mt-1 text-sm font-medium text-text-primary">
            Review what changes before approving
          </p>
        </div>
        <Shield className="h-5 w-5 shrink-0 text-accent" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <SummaryChip icon={Clock3} label={CONNECT_SESSION_SUMMARY_LABEL} />
        <SummaryChip
          icon={setup.icon}
          label={setup.label}
          tone={setup.tone}
          spin={setup.spin}
        />
        <SummaryChip
          icon={Database}
          label={pluralize(access.length, 'data area')}
        />
      </div>

      {existingSessionCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2">
          <History className="h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-100/90">
            This app already has {sessionCountLabel(existingSessionCount)} for this identity.
            Approving creates a separate {CONNECT_SESSION_SUMMARY_LABEL}.
          </p>
        </div>
      )}
    </section>
  );
}

function ScopeBadges({ scopes }: { scopes: ProtocolAccess['displayScopes'] }) {
  if (scopes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {scopes.map((scope) => {
        const color = getScopeColor(scope.method);
        return (
          <span
            key={`${scope.interface}.${scope.method}`}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SCOPE_COLOR_CLASSES[color]}`}
            title={getScopeLabel(scope)}
          >
            {getScopeDisplayLabel(scope)}
          </span>
        );
      })}
    </div>
  );
}

function AccessRows({ access }: { access: ProtocolAccess[] }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
        Access after approval
      </p>

      <div className="overflow-hidden rounded-xl border border-border-default bg-surface-2">
        {access.map((item, index) => (
          <div
            key={item.protocolUri}
            className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${index > 0 ? 'border-t border-border-subtle' : ''}`}
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium text-text-primary">
                  {item.name}
                </p>
                {item.hasEncryptedTypes && (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/15 px-2 py-0.5 text-[10px] font-medium text-blue-400"
                    title="This data uses end-to-end encryption"
                  >
                    <Lock className="h-3 w-3" />
                    Encrypted
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-text-secondary">
                {item.description}
              </p>
            </div>

            <div className="sm:shrink-0">
              <ScopeBadges scopes={item.displayScopes} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SetupStatusBadge({ status }: { status: ProtocolSetupStatus }) {
  const display = SETUP_STATUS_DISPLAY[status];

  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${display.className}`}>
      {display.label}
    </span>
  );
}

function SetupItemList({ items }: { items: ProtocolAccess[] }) {
  return (
    <div className="mt-3 space-y-2">
      {items.map((item) => (
        <div
          key={item.protocolUri}
          className="flex flex-col gap-2 rounded-lg bg-surface-2/70 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-xs font-medium text-text-primary">
                {item.name}
              </p>
              {item.hasEncryptedTypes && (
                <Lock className="h-3 w-3 shrink-0 text-blue-400" />
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-text-secondary">
              {item.description}
            </p>
          </div>
          <SetupStatusBadge status={item.setupStatus} />
        </div>
      ))}
    </div>
  );
}

function SetupNameChips({ items }: { items: ProtocolAccess[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.protocolUri}
          className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-300"
        >
          <CheckCircle2 className="h-3 w-3" />
          {item.name}
        </span>
      ))}
    </div>
  );
}

function SetupBundle({
  icon: Icon,
  title,
  summary,
  items,
  tone,
  compact = false,
  spin = false,
}: {
  icon: LucideIcon;
  title: string;
  summary: string;
  items: ProtocolAccess[];
  tone: SetupTone;
  compact?: boolean;
  spin?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${setupGroupClasses(tone)}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${setupIconClasses(tone)}`}>
          <Icon className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-text-primary">
              {title}
            </p>
            <span
              className="inline-flex items-center rounded-full border border-border-subtle bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary"
            >
              {pluralize(items.length, 'data area')}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {summary}
          </p>
          {compact ? (
            <SetupNameChips items={items} />
          ) : (
            <SetupItemList items={items} />
          )}
        </div>
      </div>
    </div>
  );
}

function setupChangeTitle(items: ProtocolAccess[]): string {
  const hasInstall = items.some((item) => item.setupStatus === 'install');
  const hasUpdate = items.some((item) => item.setupStatus === 'update');

  if (hasInstall && hasUpdate) return 'Will add or update data areas';
  if (hasUpdate) return 'Will update data areas';
  return 'Will add data areas';
}

function SetupPlan({ access }: { access: ProtocolAccess[] }) {
  const setupChanges = access.filter((item) =>
    item.setupStatus === 'install'
    || item.setupStatus === 'update'
  );
  const setupChecks = access.filter((item) =>
    item.setupStatus === 'checking'
    || item.setupStatus === 'unavailable'
  );
  const ready = access.filter((item) => item.setupStatus === 'configured');
  const hasSetupWork = setupChanges.length > 0 || setupChecks.length > 0;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
        Wallet setup
      </p>

      <div className="space-y-2">
        {setupChanges.length > 0 && (
          <SetupBundle
            icon={setupChanges.some((item) => item.setupStatus === 'update') ? RefreshCw : Download}
            title={setupChangeTitle(setupChanges)}
            summary="Your wallet does this first, then grants the requested access."
            items={setupChanges}
            tone={setupChanges.some((item) => item.setupStatus === 'update') ? 'warning' : 'info'}
          />
        )}

        {setupChecks.length > 0 && (
          <SetupBundle
            icon={setupChecks.some((item) => item.setupStatus === 'unavailable') ? AlertTriangle : Loader2}
            title="Still checking setup"
            summary="The wallet needs to verify these data areas before approval can finish."
            items={setupChecks}
            tone={setupChecks.some((item) => item.setupStatus === 'unavailable') ? 'warning' : 'neutral'}
            spin={setupChecks.every((item) => item.setupStatus === 'checking')}
          />
        )}

        {ready.length > 0 && (
          <SetupBundle
            icon={CheckCircle2}
            title={hasSetupWork ? 'Already ready' : 'No setup changes'}
            summary={hasSetupWork
              ? 'These data areas are already set up. The wallet will not change them.'
              : 'These data areas are already set up for this identity.'}
            items={ready}
            tone="success"
            compact
          />
        )}
      </div>
    </section>
  );
}

function TechnicalDetails({ access }: { access: ProtocolAccess[] }) {
  return (
    <details className="group rounded-xl border border-border-default bg-surface-2 p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium text-text-secondary hover:text-text-primary">
        <span className="inline-flex items-center gap-1.5">
          <Code className="h-3.5 w-3.5" />
          Technical details
        </span>
        <ChevronDown className="h-4 w-4 text-text-ghost transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-4 space-y-5">
        {access.map((item) => {
          const typeNames = Object.keys(item.permission.protocolDefinition.types ?? {});
          const encryptedTypeCount = getEncryptedTypeCount(item.permission.protocolDefinition);
          const protocolJson = JSON.stringify(item.permission.protocolDefinition, null, 2);

          return (
            <div key={item.protocolUri} className="space-y-3 border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
              <div>
                <p className="text-sm font-medium text-text-primary">{item.name}</p>
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
      </div>
    </details>
  );
}

export function PermissionDisplay({
  permissions,
  protocolSetupStatuses,
  existingSessionCount = 0,
}: PermissionDisplayProps) {
  if (permissions.length === 0) return null;

  const access = getProtocolAccess(permissions, protocolSetupStatuses);

  return (
    <div className="space-y-4">
      <ConnectionSummary
        access={access}
        existingSessionCount={existingSessionCount}
      />
      <SetupPlan access={access} />
      <AccessRows access={access} />
      <TechnicalDetails access={access} />
    </div>
  );
}
