/**
 * Permission display for DWeb Connect consent screens.
 *
 * Shows a rich, user-friendly breakdown of what protocols and permissions
 * a dapp is requesting, with human-readable names, descriptions,
 * colour-coded scope badges, and encryption indicators.
 */
import { Lock, Shield } from 'lucide-react';
import type { ConnectPermissionRequest } from '@enbox/agent';
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

        // Deduplicate scope methods for badge display.
        const scopeMethods = [...new Set(
          perm.permissionScopes.map((s: any) => s.method as string),
        )];

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

            {/* Scope badges */}
            <div className="flex flex-wrap gap-1.5">
              {scopeMethods.map((method) => {
                const color = getScopeColor(method);
                return (
                  <span
                    key={method}
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SCOPE_COLOR_CLASSES[color]}`}
                  >
                    {getScopeLabel({ interface: 'Records', method })}
                  </span>
                );
              })}
            </div>

            {/* Raw protocol URI (collapsed detail) */}
            <p className="text-[10px] font-mono text-text-ghost truncate" title={protocolUri}>
              {protocolUri}
            </p>
          </div>
        );
      })}
    </div>
  );
}
