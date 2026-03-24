/**
 * Default DWN (Decentralised Web Node) endpoints.
 * These are the remote DWNs that identities register with and sync to.
 */
export const DEFAULT_DWN_ENDPOINTS: string[] = [
  'https://enbox-dwn.fly.dev',
  'https://dev.aws.dwn.enbox.id',
];

/**
 * The public-facing wallet URL used by DWeb Connect handlers
 * and written into wallet records via the Connect protocol.
 */
export const WALLET_URL = 'https://enbox-wallet.pages.dev';
