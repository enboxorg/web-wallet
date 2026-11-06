import type { DwnModuleDefinition } from '@enbox/agent';

import {
  ConnectDefinition,
  PreferencesDefinition,
  ProfileDefinition,
} from '@enbox/modules';

/** Metadata for a known module. */
export interface ModuleInfo {
  /** Human-friendly display name. */
  name: string;
  /** Short description of what the module manages. */
  description: string;
}

/** Registry of known module URIs with human-friendly metadata. */
const MODULE_REGISTRY: Record<string, ModuleInfo> = {
  // ─── Identity Foundation modules ──────────────────────────────
  [ProfileDefinition.module]: {
    name        : 'Profile',
    description : 'Public profile data such as display name, bio, and avatar',
  },
  [ConnectDefinition.module]: {
    name        : 'Connect',
    description : 'Wallet discovery and connection records',
  },
  [PreferencesDefinition.module]: {
    name        : 'Preferences',
    description : 'Theme, locale, privacy, and notification preferences',
  },

  // ─── Enbox modules ───────────────────────────────────────────
  'https://enbox.id/protocols/cashu-wallet': {
    name        : 'Cashu Wallet',
    description : 'Private ecash wallet data including proofs, keysets, transactions, and mint settings',
  },
  'https://enbox.id/protocols/cashu-transfer': {
    name        : 'Cashu Transfers',
    description : 'Send and receive ecash transfers between identities via P2PK',
  },
};

const CANONICAL_MODULE_DEFINITIONS = new Map<string, DwnModuleDefinition>([
  [ProfileDefinition.module, ProfileDefinition as DwnModuleDefinition],
  [ConnectDefinition.module, ConnectDefinition as DwnModuleDefinition],
  [PreferencesDefinition.module, PreferencesDefinition as DwnModuleDefinition],
]);

export function getCanonicalModuleDefinition(uri: string): DwnModuleDefinition | undefined {
  return CANONICAL_MODULE_DEFINITIONS.get(uri);
}

/** Whether the module URI has curated wallet display metadata. */
export function isKnownModule(uri: string): boolean {
  return uri in MODULE_REGISTRY;
}

/**
 * Get a human-friendly name for a module URI.
 * Falls back to the last path segment if the URI is unknown.
 */
export function getModuleName(uri: string): string {
  const info = MODULE_REGISTRY[uri];
  if (info) { return info.name; }
  // Fall back to last path segment, title-cased.
  const parts = uri.split('/');
  const last = parts[parts.length - 1] || uri;
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the full module info for a URI, or a sensible fallback.
 */
export function getModuleInfo(uri: string): ModuleInfo {
  const info = MODULE_REGISTRY[uri];
  if (info) { return info; }
  return {
    name        : getModuleName(uri),
    description : `Module at ${uri}`,
  };
}

/** Human-readable label for a DWN permission scope interface + method. */
export function getScopeLabel(scope: { interface: string; method: string }): string {
  const method = scope.method;
  if (scope.interface === 'Records') {
    switch (method) {
      case 'Write':  return 'Write';
      case 'Read':   return 'Read';
      case 'Delete': return 'Delete';
      default:       return `${scope.interface}.${method}`;
    }
  }

  return `${scope.interface}.${method}`;
}
