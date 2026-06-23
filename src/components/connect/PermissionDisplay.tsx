/**
 * Permission display for DWeb Connect consent screens.
 *
 * Presents a compact, summary-first approval view:
 * - temporary session + setup + data-area summary
 * - user-facing access rows
 * - setup changes only when something will be added/updated
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

type SetupDisplay = {
  icon: LucideIcon;
  title: string;
  body: (protocolName: string) => string;
  className: string;
  iconClassName: string;
  spin?: boolean;
};

const SETUP_DISPLAY: Record<ProtocolSetupStatus, SetupDisplay> = {
  checking: {
    icon          : Loader2,
    title         : 'Checking setup',
    body          : (protocolName) => `Checking whether ${protocolName} is ready for this identity.`,
    className     : 'border-border-subtle bg-surface-1',
    iconClassName : 'text-text-secondary',
    spin          : true,
  },
  configured: {
    icon          : CheckCircle2,
    title         : 'Already ready',
    body          : (protocolName) => `${protocolName} is already ready for this identity.`,
    className     : 'border-green-500/20 bg-green-500/10',
    iconClassName : 'text-green-400',
  },
  install: {
    icon          : Download,
    title         : 'Will add data format',
    body          : (protocolName) => `Adds ${protocolName} so this app can use its data with this identity.`,
    className     : 'border-blue-500/20 bg-blue-500/10',
    iconClassName : 'text-blue-400',
  },
  update: {
    icon          : RefreshCw,
    title         : 'Will update data format',
    body          : (protocolName) => `${protocolName} uses a newer setup than this identity has today.`,
    className     : 'border-amber-500/20 bg-amber-500/10',
    iconClassName : 'text-amber-400',
  },
  unavailable: {
    icon          : AlertTriangle,
    title         : 'Could not verify setup',
    body          : (protocolName) => `The wallet could not verify ${protocolName} yet. It will check again before approval.`,
    className     : 'border-amber-500/20 bg-amber-500/10',
    iconClassName : 'text-amber-400',
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
  tone: 'neutral' | 'success' | 'info' | 'warning';
  icon: LucideIcon;
  spin?: boolean;
} {
  const updates = access.filter((item) => item.setupStatus === 'update').length;
  const installs = access.filter((item) => item.setupStatus === 'install').length;
  const unavailable = access.filter((item) => item.setupStatus === 'unavailable').length;
  const checking = access.filter((item) => item.setupStatus === 'checking').length;

  if (updates > 0) {
    return {
      label : `Updates ${pluralize(updates, 'data format')}`,
      tone  : 'warning',
      icon  : RefreshCw,
    };
  }
  if (installs > 0) {
    return {
      label : `Adds ${pluralize(installs, 'data format')}`,
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
    label : 'No new setup',
    tone  : 'success',
    icon  : CheckCircle2,
  };
}

function summaryToneClasses(tone: 'neutral' | 'success' | 'info' | 'warning'): string {
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

function sessionCountLabel(count: number): string {
  return count === 1 ? '1 active session' : `${count} active sessions`;
}

function SummaryChip({
  icon: Icon,
  label,
  tone = 'neutral',
  spin,
}: {
  icon: LucideIcon;
  label: string;
  tone?: 'neutral' | 'success' | 'info' | 'warning';
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
          >
            {getScopeLabel(scope)}
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
        Access requested
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

function SetupChanges({ access }: { access: ProtocolAccess[] }) {
  const visibleSetup = access.filter((item) =>
    item.setupStatus === 'install'
    || item.setupStatus === 'update'
    || item.setupStatus === 'unavailable'
  );
  if (visibleSetup.length === 0) return null;

  return (
    <section className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-text-ghost">
        Wallet setup
      </p>

      <div className="space-y-2">
        {visibleSetup.map((item) => {
          const display = SETUP_DISPLAY[item.setupStatus];
          const Icon = display.icon;

          return (
            <div
              key={item.protocolUri}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${display.className}`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${display.iconClassName} ${display.spin ? 'animate-spin' : ''}`}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary">
                  {display.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
                  {display.body(item.name)}
                </p>
              </div>
            </div>
          );
        })}
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
      <AccessRows access={access} />
      <SetupChanges access={access} />
      <TechnicalDetails access={access} />
    </div>
  );
}
