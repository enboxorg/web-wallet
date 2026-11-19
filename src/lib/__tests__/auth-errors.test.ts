import { describe, expect, it } from 'vitest';

import { describeAuthError } from '../auth-errors';

describe('describeAuthError', () => {
  const vaultError = 'HdIdentityVault: Unable to unlock the vault due to an incorrect password.';

  it('turns a wrong-PIN vault failure into plain language', () => {
    expect(describeAuthError(vaultError)).toBe('That PIN isn’t right. Try again.');
  });

  it('words the same failure for passkey unlock', () => {
    expect(describeAuthError(vaultError, 'passkey')).toMatch(/passkey didn’t unlock this wallet/);
  });

  it('drops SDK class prefixes from other errors', () => {
    expect(describeAuthError('HdIdentityVault: Vault is locked.')).toBe('Vault is locked.');
    expect(describeAuthError('Network request failed')).toBe('Network request failed');
  });

  it('passes empty errors through', () => {
    expect(describeAuthError(null)).toBeNull();
    expect(describeAuthError('')).toBeNull();
  });
});
