/**
 * Text chosen by an app or module author (an app name, a module name made
 * from a URI) made safe to show next to wallet UI.
 *
 * - Emoji, symbols and enclosing marks become spaces, so nothing can draw a
 *   check mark, shield or badge that passes for the wallet's own.
 * - Format and control characters are removed: bidi overrides can reorder
 *   what is shown and zero-width characters can hide differences.
 * - Whitespace collapses and the result is capped in length.
 *
 * Letters, combining marks, numbers and punctuation in any script are kept.
 */
const MAX_LENGTH = 64;

// Symbols (except "+", common in product names), pictographs, enclosing marks
// such as the keycap, and emoji variation selectors.
const SYMBOLS = /[\p{Extended_Pictographic}\p{S}\p{Me}︎️]/gu;
// Control, format (bidi, zero-width), private-use, surrogate and unassigned.
const INVISIBLE = /\p{C}/gu;

export function sanitizeDisplayText(value: string | null | undefined, maxLength = MAX_LENGTH): string {
  if (!value) return '';
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(SYMBOLS, (character) => (character === '+' ? character : ' '))
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(cleaned);
  return characters.length > maxLength
    ? `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`
    : cleaned;
}
