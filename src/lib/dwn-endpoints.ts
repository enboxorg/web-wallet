import { STORAGE_KEYS } from './constants';

const LOCAL_DWN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const STORED_ENDPOINTS_VERSION = 1;
const BUILT_IN_DWN_ENDPOINTS = [
  'https://enbox-dwn.fly.dev',
  'https://dev.aws.dwn.enbox.id',
] as const;

/**
 * Default DWN (Decentralised Web Node) endpoints.
 * These are the remote DWNs that identities register with and sync to.
 *
 * VITE_DWN_ENDPOINTS (comma-separated) overrides them for local
 * development against a local dwn-server, e.g.
 * `VITE_DWN_ENDPOINTS=http://localhost:3000 bun dev`.
 */
export const DEFAULT_DWN_ENDPOINTS: string[] = (() => {
  const raw = import.meta.env.VITE_DWN_ENDPOINTS || '';
  const overrides = String(raw)
    .split(',')
    .map((endpoint: string) => endpoint.trim())
    .filter(Boolean);
  return resolveDefaultDwnEndpoints(overrides.length > 0 ? overrides : BUILT_IN_DWN_ENDPOINTS);
})();

function resolveDefaultDwnEndpoints(configured: readonly string[]): string[] {
  try {
    return normalizeDwnEndpoints(configured);
  } catch (error) {
    console.warn('Invalid VITE_DWN_ENDPOINTS configuration; using hosted defaults:', error);
    return [...BUILT_IN_DWN_ENDPOINTS];
  }
}

/** Normalize and validate one remote DWN endpoint. */
export function normalizeDwnEndpoint(
  endpoint: string,
): string {
  const value = endpoint.trim();
  if (value.length === 0) {
    throw new Error('DWN endpoints cannot be empty.');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DWN endpoints must be valid absolute URLs.');
  }

  const isLoopbackDevelopmentEndpoint = import.meta.env.DEV
    && url.protocol === 'http:'
    && LOCAL_DWN_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !isLoopbackDevelopmentEndpoint) {
    throw new Error('DWN endpoints must use HTTPS. Loopback HTTP is allowed during local development.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('DWN endpoints cannot contain credentials.');
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error('DWN endpoints cannot contain query strings or fragments.');
  }
  const normalized = url.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

/** Normalize and validate a complete wallet or identity DWN endpoint list. */
export function normalizeDwnEndpoints(endpoints: readonly string[]): string[] {
  if (endpoints.length === 0) {
    throw new Error('Add at least one DWN endpoint.');
  }
  const normalized = endpoints.map(normalizeDwnEndpoint);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('DWN endpoints must be unique.');
  }
  return normalized;
}

export function getDwnEndpointValidationError(endpoints: readonly string[]): string | null {
  try {
    normalizeDwnEndpoints(endpoints);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid DWN endpoints.';
  }
}

/**
 * Read the pre-unlock endpoint cache. The signed agent DID remains authoritative
 * after the vault is unlocked; malformed cache entries fall back to build defaults.
 */
export function getConfiguredDwnEndpoints(): string[] {
  try {
    const serialized = globalThis.localStorage?.getItem(STORAGE_KEYS.WALLET_DWN_ENDPOINTS);
    if (!serialized) {
      return [...DEFAULT_DWN_ENDPOINTS];
    }

    const stored = JSON.parse(serialized) as { version?: unknown; endpoints?: unknown };
    if (
      stored.version !== STORED_ENDPOINTS_VERSION
      || !Array.isArray(stored.endpoints)
      || !stored.endpoints.every((endpoint) => typeof endpoint === 'string')
    ) {
      return [...DEFAULT_DWN_ENDPOINTS];
    }
    return normalizeDwnEndpoints(stored.endpoints);
  } catch {
    return [...DEFAULT_DWN_ENDPOINTS];
  }
}

/** Store a validated pre-unlock cache and return the canonical endpoint list. */
export function setConfiguredDwnEndpoints(endpoints: readonly string[]): string[] {
  const normalized = normalizeDwnEndpoints(endpoints);
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEYS.WALLET_DWN_ENDPOINTS,
      JSON.stringify({ version: STORED_ENDPOINTS_VERSION, endpoints: normalized }),
    );
  } catch (error) {
    console.warn('Unable to cache wallet DWN endpoints:', error);
  }
  return normalized;
}

/**
 * The public-facing wallet URL used by DWeb Connect handlers
 * and written into wallet records via the Connect protocol.
 *
 * Respects the VITE_PRODUCT_THEME env var so the blue variant
 * writes its own URL.
 */
export const WALLET_URL: string = (() => {
  const theme = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PRODUCT_THEME) || '';
  if (theme === 'blue') { return 'https://blue-enbox-wallet.pages.dev'; }
  return 'https://enbox-wallet.pages.dev';
})();
