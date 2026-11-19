/**
 * Password-protected profile backup files.
 *
 * An export contains each profile's private keys, so the file is encrypted
 * with a password chosen at export time. The 4-digit wallet PIN is not used:
 * 10,000 combinations fall to offline guessing no matter how slow the key
 * derivation is, and passkey wallets have no PIN at all.
 *
 * Scheme: PBKDF2-HMAC-SHA-256 stretches the password into an AES-256-GCM key;
 * the JSON payload is encrypted with a random IV, and the file header (format,
 * version, KDF and cipher parameters) is bound as additional authenticated
 * data so it can't be altered without failing decryption.
 */

export const BACKUP_FORMAT = 'enbox-profile-backup';
export const BACKUP_VERSION = 1;
export const MIN_BACKUP_PASSWORD_LENGTH = 8;

/** OWASP's 2023 floor for PBKDF2-HMAC-SHA-256. */
const DEFAULT_ITERATIONS = 600_000;
/** Bounds for files we read: no trivially weak or tab-freezing parameters. */
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 10_000_000;

export interface EncryptedBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  ciphertext: string;
}

export class WrongBackupPasswordError extends Error {
  constructor() {
    super('That password didn’t unlock this backup.');
    this.name = 'WrongBackupPasswordError';
  }
}

export class UnsupportedBackupError extends Error {
  constructor(reason: string) {
    super(`This backup file can’t be read: ${reason}`);
    this.name = 'UnsupportedBackupError';
  }
}

export function isEncryptedBackup(value: unknown): value is EncryptedBackup {
  return typeof value === 'object'
    && value !== null
    && (value as { format?: unknown }).format === BACKUP_FORMAT;
}

/** Reason a password can't protect a backup, or null when it can. */
export function backupPasswordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
    return `Use at least ${MIN_BACKUP_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) {
    return 'The passwords don’t match.';
  }
  return null;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** The authenticated header, serialised in a fixed key order. */
function headerBytes(backup: Omit<EncryptedBackup, 'ciphertext'>): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({
    format  : backup.format,
    version : backup.version,
    kdf     : {
      name       : backup.kdf.name,
      hash       : backup.kdf.hash,
      iterations : backup.kdf.iterations,
      salt       : backup.kdf.salt,
    },
    cipher: { name: backup.cipher.name, iv: backup.cipher.iv },
  }));
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptBackup(
  payload: unknown,
  password: string,
  options: { iterations?: number } = {},
): Promise<EncryptedBackup> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header: Omit<EncryptedBackup, 'ciphertext'> = {
    format  : BACKUP_FORMAT,
    version : BACKUP_VERSION,
    kdf     : { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher  : { name: 'AES-GCM', iv: toBase64(iv) },
  };

  const key = await deriveKey(password, salt, iterations, 'encrypt');
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: headerBytes(header) },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return { ...header, ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

export async function decryptBackup(backup: EncryptedBackup, password: string): Promise<unknown> {
  if (backup.version !== BACKUP_VERSION) {
    throw new UnsupportedBackupError(`version ${String(backup.version)} isn’t supported by this wallet.`);
  }
  const { kdf, cipher } = backup;
  if (
    kdf?.name !== 'PBKDF2'
    || kdf.hash !== 'SHA-256'
    || cipher?.name !== 'AES-GCM'
    || !Number.isInteger(kdf.iterations)
    || kdf.iterations < MIN_ITERATIONS
    || kdf.iterations > MAX_ITERATIONS
  ) {
    throw new UnsupportedBackupError('its encryption settings aren’t recognised.');
  }

  let salt: Uint8Array<ArrayBuffer>;
  let iv: Uint8Array<ArrayBuffer>;
  let ciphertext: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(kdf.salt);
    iv = fromBase64(cipher.iv);
    ciphertext = fromBase64(backup.ciphertext);
  } catch {
    throw new UnsupportedBackupError('the file is damaged.');
  }

  const key = await deriveKey(password, salt, kdf.iterations, 'decrypt');
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: headerBytes(backup) },
      key,
      ciphertext,
    );
  } catch {
    // AES-GCM can't tell a wrong password from a tampered file; the wrong
    // password is by far the likelier cause.
    throw new WrongBackupPasswordError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/** Trigger a browser download of a JSON file. */
export function downloadJsonFile(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
