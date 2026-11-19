import { describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  backupPasswordProblem,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  UnsupportedBackupError,
  WrongBackupPasswordError,
} from '../encrypted-backup';

// The real default (600k) is slow in tests; the scheme is identical.
const FAST = { iterations: 100_000 };
const payload = [{ portableDid: { uri: 'did:dht:alice', privateKeys: [{ d: 'secret' }] } }];

describe('encrypted backups', () => {
  it('round-trips the payload with the right password', async () => {
    const backup = await encryptBackup(payload, 'correct horse battery', FAST);
    expect(isEncryptedBackup(backup)).toBe(true);
    expect(backup.format).toBe(BACKUP_FORMAT);
    await expect(decryptBackup(backup, 'correct horse battery')).resolves.toEqual(payload);
  });

  it('never stores the keys in readable form', async () => {
    const backup = await encryptBackup(payload, 'correct horse battery', FAST);
    expect(JSON.stringify(backup)).not.toContain('secret');
    expect(JSON.stringify(backup)).not.toContain('did:dht:alice');
  });

  it('uses a fresh salt and IV every time', async () => {
    const first = await encryptBackup(payload, 'correct horse battery', FAST);
    const second = await encryptBackup(payload, 'correct horse battery', FAST);
    expect(first.kdf.salt).not.toBe(second.kdf.salt);
    expect(first.cipher.iv).not.toBe(second.cipher.iv);
  });

  it('rejects a wrong password', async () => {
    const backup = await encryptBackup(payload, 'correct horse battery', FAST);
    await expect(decryptBackup(backup, 'wrong horse battery')).rejects.toBeInstanceOf(WrongBackupPasswordError);
  });

  it('detects a tampered header, which is authenticated', async () => {
    const backup = await encryptBackup(payload, 'correct horse battery', FAST);
    await expect(decryptBackup({ ...backup, kdf: { ...backup.kdf, iterations: 100_001 } }, 'correct horse battery'))
      .rejects.toBeInstanceOf(WrongBackupPasswordError);
  });

  it('refuses unreadable or abusive parameters before deriving a key', async () => {
    const backup = await encryptBackup(payload, 'correct horse battery', FAST);
    await expect(decryptBackup({ ...backup, kdf: { ...backup.kdf, iterations: 1e12 } }, 'x'))
      .rejects.toBeInstanceOf(UnsupportedBackupError);
    await expect(decryptBackup({ ...backup, kdf: { ...backup.kdf, iterations: 1000 } }, 'x'))
      .rejects.toBeInstanceOf(UnsupportedBackupError);
    await expect(decryptBackup({ ...backup, version: 2 as never }, 'x'))
      .rejects.toBeInstanceOf(UnsupportedBackupError);
  });

  it('tells plain exports apart from protected ones', () => {
    expect(isEncryptedBackup(payload)).toBe(false);
    expect(isEncryptedBackup({ portableDid: {} })).toBe(false);
    expect(isEncryptedBackup(null)).toBe(false);
  });

  it('explains what a usable password needs', () => {
    expect(backupPasswordProblem('short', 'short')).toMatch(/at least 8/);
    expect(backupPasswordProblem('long enough', 'long enuogh')).toMatch(/don’t match/);
    expect(backupPasswordProblem('long enough', 'long enough')).toBeNull();
  });
});
