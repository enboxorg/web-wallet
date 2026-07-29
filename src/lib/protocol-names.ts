import type { DwnProtocolDefinition } from '@enbox/agent';

import {
  ConnectDefinition,
  PreferencesDefinition,
  ProfileDefinition,
} from '@enbox/protocols';

/** Metadata for a known protocol. */
export interface ProtocolInfo {
  /** Human-friendly display name. */
  name: string;
  /** Short description of what the protocol manages. */
  description: string;
}

/** Registry of known protocol URIs with human-friendly metadata. */
const PROTOCOL_REGISTRY: Record<string, ProtocolInfo> = {
  // ─── Identity Foundation protocols ──────────────────────────────
  'https://identity.foundation/protocols/profile': {
    name        : 'Profile',
    description : 'Public profile data such as display name, bio, and avatar',
  },
  'https://identity.foundation/protocols/connect': {
    name        : 'Connect',
    description : 'Wallet discovery and connection records',
  },
  'https://identity.foundation/protocols/preferences': {
    name        : 'Preferences',
    description : 'Theme, locale, privacy, and notification preferences',
  },

  // ─── Enbox protocols ───────────────────────────────────────────
  'https://enbox.id/protocols/cashu-wallet': {
    name        : 'Cashu Wallet',
    description : 'Private ecash wallet data including proofs, keysets, transactions, and mint settings',
  },
  'https://enbox.id/protocols/cashu-transfer': {
    name        : 'Cashu Transfers',
    description : 'Send and receive ecash transfers between identities via P2PK',
  },
};

const CANONICAL_PROTOCOL_DEFINITIONS = new Map<string, DwnProtocolDefinition>([
  [ProfileDefinition.protocol, ProfileDefinition as DwnProtocolDefinition],
  [ConnectDefinition.protocol, ConnectDefinition as DwnProtocolDefinition],
  [PreferencesDefinition.protocol, PreferencesDefinition as DwnProtocolDefinition],
]);

export function getCanonicalProtocolDefinition(uri: string): DwnProtocolDefinition | undefined {
  return CANONICAL_PROTOCOL_DEFINITIONS.get(uri);
}

/** Whether the protocol URI has curated wallet display metadata. */
export function isKnownProtocol(uri: string): boolean {
  return uri in PROTOCOL_REGISTRY;
}

/**
 * Get a human-friendly name for a protocol URI.
 * Falls back to the last path segment if the URI is unknown.
 */
export function getProtocolName(uri: string): string {
  const info = PROTOCOL_REGISTRY[uri];
  if (info) { return info.name; }
  // Fall back to last path segment, title-cased.
  const parts = uri.split('/');
  const last = parts[parts.length - 1] || uri;
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the full protocol info for a URI, or a sensible fallback.
 */
export function getProtocolInfo(uri: string): ProtocolInfo {
  const info = PROTOCOL_REGISTRY[uri];
  if (info) { return info; }
  return {
    name        : getProtocolName(uri),
    description : `Protocol at ${uri}`,
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
