/**
 * Plain-language messages for wallet authentication failures.
 *
 * The SDK reports vault failures verbatim, e.g. "HdIdentityVault: Unable to
 * unlock the vault due to an incorrect password." — meaningless to someone who
 * just typed a PIN.
 */
export function describeAuthError(
  message: string | null | undefined,
  method: 'pin' | 'passkey' = 'pin',
): string | null {
  if (!message) return null;

  if (/incorrect password|unable to unlock the vault/i.test(message)) {
    return method === 'passkey'
      ? 'That passkey didn’t unlock this wallet. Try again, or restore with your recovery phrase.'
      : 'That PIN isn’t right. Try again.';
  }

  // Drop an SDK class prefix ("HdIdentityVault: …") from anything else.
  return message.replace(/^[A-Z][A-Za-z]*(?:Vault|Error|Failure):\s+/, '');
}
