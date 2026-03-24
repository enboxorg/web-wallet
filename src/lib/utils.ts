import { clsx, type ClassValue } from 'clsx';

/**
 * Merge class names with clsx. Tailwind v4 handles specificity natively,
 * so we don't need tailwind-merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/**
 * Truncate a DID URI for display. Shows the method and abbreviated identifier.
 * e.g. "did:dht:abc123...xyz789"
 */
export function truncateDid(did: string, chars = 8): string {
  if (!did || did.length <= chars * 2 + 10) return did;

  const parts = did.split(':');
  if (parts.length < 3) return did;

  const method = parts[1];
  const identifier = parts.slice(2).join(':');

  if (identifier.length <= chars * 2) return did;

  const start = identifier.slice(0, chars);
  const end = identifier.slice(-chars);
  return `did:${method}:${start}...${end}`;
}

/**
 * Copy text to clipboard. Returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format a timestamp to a human-readable relative time string.
 */
export function formatRelativeTime(date: Date | string | number): string {
  const now = Date.now();
  const timestamp = new Date(date).getTime();
  const seconds = Math.floor((now - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ago`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days}d ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}

