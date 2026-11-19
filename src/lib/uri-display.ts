/**
 * Helpers for showing a URI exactly as written while still making it easy to
 * read: which part is the host, and where a long one may wrap.
 */

export interface UriHostParts {
  /** Scheme and any user-info, up to where the host starts. */
  before: string;
  /** The host exactly as written. */
  host: string;
  /** Everything after the host. */
  after: string;
}

/**
 * Find the host inside a web URI without rewriting any of it. Returns nothing
 * unless the text between `://` and the path is the host a browser would
 * actually connect to, so text that only looks like a host — user-info such
 * as `enbox.id@`, or a backslash trick — is never the part that gets marked.
 */
export function splitUriHost(uri: string): UriHostParts | undefined {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;

  const schemeEnd = uri.indexOf('://');
  if (schemeEnd === -1) return undefined;

  const authorityStart = schemeEnd + 3;
  const rest = uri.slice(authorityStart);
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd === -1 ? rest : rest.slice(0, authorityEnd);
  const hostStart = authority.lastIndexOf('@') + 1;
  const host = authority.slice(hostStart);
  if (!host || host.toLowerCase() !== url.host) return undefined;

  const hostOffset = authorityStart + hostStart;
  return {
    before : uri.slice(0, hostOffset),
    host,
    after  : uri.slice(hostOffset + host.length),
  };
}

/**
 * Cut text after each `/` that starts a new path segment, so a renderer can
 * allow a line break there. A run of slashes (`://`) stays in one piece, and
 * joining the pieces gives back the original text.
 */
export function splitAfterSlashes(text: string): string[] {
  const pieces: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length - 1; index += 1) {
    if (text[index] === '/' && text[index + 1] !== '/') {
      pieces.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }
  pieces.push(text.slice(start));
  return pieces;
}
