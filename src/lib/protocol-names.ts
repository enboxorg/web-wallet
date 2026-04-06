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
  'https://identity.foundation/protocols/social-graph': {
    name        : 'Social Graph',
    description : 'Social connections and follow relationships between identities',
  },
  'https://identity.foundation/protocols/connect': {
    name        : 'Connect',
    description : 'Wallet discovery and connection records',
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
  switch (method) {
    case 'Write':     return 'Write';
    case 'Read':      return 'Read';
    case 'Delete':    return 'Delete';
    case 'Query':     return 'Query';
    case 'Subscribe': return 'Subscribe';
    case 'Configure': return 'Configure';
    default:          return `${scope.interface}.${method}`;
  }
}

/** Colour hint for a permission scope (for UI badge colouring). */
export type ScopeColor = 'green' | 'amber' | 'red' | 'blue' | 'gray';

/** Get a colour category for a scope method. */
export function getScopeColor(method: string): ScopeColor {
  switch (method) {
    case 'Read':
    case 'Query':
    case 'Subscribe': return 'green';
    case 'Write':
    case 'Configure': return 'amber';
    case 'Delete':    return 'red';
    default:          return 'gray';
  }
}
