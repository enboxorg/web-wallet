import { describe, it, expect } from 'vitest';

import { getProtocolName } from '../protocol-names';

describe('getProtocolName', () => {
  // ── Known protocol URIs ───────────────────────────────────────────

  it('returns "Profile" for the profile protocol URI', () => {
    expect(
      getProtocolName('https://identity.foundation/protocols/profile'),
    ).toBe('Profile');
  });

  it('returns "Social Graph" for the social-graph protocol URI', () => {
    expect(
      getProtocolName('https://identity.foundation/protocols/social-graph'),
    ).toBe('Social Graph');
  });

  it('returns "Connect" for the connect protocol URI', () => {
    expect(
      getProtocolName('https://identity.foundation/protocols/connect'),
    ).toBe('Connect');
  });

  // ── Unknown URIs fall back to last path segment ───────────────────

  it('returns the last path segment for an unknown URI', () => {
    expect(
      getProtocolName('https://example.com/protocols/messaging'),
    ).toBe('messaging');
  });

  it('returns the last segment for a deep path', () => {
    expect(
      getProtocolName('https://example.com/a/b/c/my-protocol'),
    ).toBe('my-protocol');
  });

  it('returns the last segment for a URI with no known mapping', () => {
    expect(
      getProtocolName('https://identity.foundation/protocols/unknown-proto'),
    ).toBe('unknown-proto');
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('returns the full URI when there are no slashes', () => {
    // uri.split('/') → ['just-a-string'], last element is the whole thing
    expect(getProtocolName('just-a-string')).toBe('just-a-string');
  });

  it('returns the URI itself for an empty string (no segments)', () => {
    // ''.split('/') → [''], last element is '', fallback to uri ('')
    expect(getProtocolName('')).toBe('');
  });

  it('returns the URI when the last segment is empty (trailing slash)', () => {
    // 'https://example.com/foo/'.split('/') → [..., ''], last is ''
    // fallback: '' || uri → returns the full URI
    expect(
      getProtocolName('https://example.com/foo/'),
    ).toBe('https://example.com/foo/');
  });

  it('handles a URI that is just a slash', () => {
    // '/'.split('/') → ['', ''], last is '' → fallback to '/'
    expect(getProtocolName('/')).toBe('/');
  });

  it('handles a URI with query parameters (no special parsing)', () => {
    // The function does simple split on '/', so query params stay on the last segment
    expect(
      getProtocolName('https://example.com/proto?version=2'),
    ).toBe('proto?version=2');
  });
});
