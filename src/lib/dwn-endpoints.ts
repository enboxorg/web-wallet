/**
 * Default DWN (Decentralised Web Node) endpoints.
 * These are the remote DWNs that identities register with and sync to.
 *
 * VITE_DWN_ENDPOINTS (comma-separated) overrides them for local
 * development against a local dwn-server, e.g.
 * `VITE_DWN_ENDPOINTS=http://localhost:3000 bun dev`.
 */
export const DEFAULT_DWN_ENDPOINTS: string[] = (() => {
  const raw =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DWN_ENDPOINTS) || '';
  const overrides = String(raw)
    .split(',')
    .map((endpoint: string) => endpoint.trim())
    .filter(Boolean);
  if (overrides.length > 0) { return overrides; }
  return ['https://enbox-dwn.fly.dev', 'https://dev.aws.dwn.enbox.id'];
})();

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
