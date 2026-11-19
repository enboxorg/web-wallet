import { describe, expect, it } from 'vitest';

import { sanitizeDisplayText } from '../display-text';

describe('sanitizeDisplayText', () => {
  it('removes emoji and symbols that could pass for wallet badges', () => {
    expect(sanitizeDisplayText('PayPal ✅ Verified')).toBe('PayPal Verified');
    expect(sanitizeDisplayText('✓ Notes')).toBe('Notes');
    expect(sanitizeDisplayText('Notes 🛡️')).toBe('Notes');
    expect(sanitizeDisplayText('Bank™ ★★★')).toBe('Bank');
    expect(sanitizeDisplayText('Count 1️⃣')).toBe('Count 1');
    expect(sanitizeDisplayText('Team 👨‍👩‍👧 Chat')).toBe('Team Chat');
  });

  it('removes bidi overrides and zero-width characters', () => {
    expect(sanitizeDisplayText('evil‮moc.lapyap')).toBe('evilmoc.lapyap');
    expect(sanitizeDisplayText('Pay​Pal')).toBe('PayPal');
    expect(sanitizeDisplayText('line\nbreak\tand  spaces')).toBe('line break and spaces');
  });

  it('keeps letters, marks, numbers and punctuation in any script', () => {
    expect(sanitizeDisplayText('Bills & Budgets (2026)')).toBe('Bills & Budgets (2026)');
    expect(sanitizeDisplayText('Café Ñandú')).toBe('Café Ñandú');
    expect(sanitizeDisplayText('मेरे नोट्स')).toBe('मेरे नोट्स');
    expect(sanitizeDisplayText('Google+')).toBe('Google+');
  });

  it('caps the length', () => {
    const long = 'A'.repeat(100);
    expect(Array.from(sanitizeDisplayText(long))).toHaveLength(64);
    expect(sanitizeDisplayText(long).endsWith('…')).toBe(true);
  });

  it('turns nothing-but-symbols into an empty string for the caller to replace', () => {
    expect(sanitizeDisplayText('✅✅✅')).toBe('');
    expect(sanitizeDisplayText(undefined)).toBe('');
  });
});
