/** Map known protocol URIs to human-friendly display names. */
const PROTOCOL_NAMES: Record<string, string> = {
  'https://identity.foundation/protocols/profile': 'Profile',
  'https://identity.foundation/protocols/social-graph': 'Social Graph',
  'https://identity.foundation/protocols/connect': 'Connect',
};

/**
 * Get a human-friendly name for a protocol URI.
 * Falls back to the last path segment if the URI is unknown.
 */
export function getProtocolName(uri: string): string {
  if (PROTOCOL_NAMES[uri]) return PROTOCOL_NAMES[uri];
  // Fall back to last path segment
  const parts = uri.split('/');
  return parts[parts.length - 1] || uri;
}
