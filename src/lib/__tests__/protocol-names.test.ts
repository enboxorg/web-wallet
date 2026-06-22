import { describe, it, expect } from 'vitest';

import { getProtocolName, getProtocolInfo, getScopeColor, getScopeLabel } from '../protocol-names';

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

  it('returns "Cashu Wallet" for the cashu-wallet protocol URI', () => {
    expect(
      getProtocolName('https://enbox.id/protocols/cashu-wallet'),
    ).toBe('Cashu Wallet');
  });

  it('returns "Cashu Transfers" for the cashu-transfer protocol URI', () => {
    expect(
      getProtocolName('https://enbox.id/protocols/cashu-transfer'),
    ).toBe('Cashu Transfers');
  });

  // ── Unknown URIs fall back to title-cased last path segment ───────

  it('returns the title-cased last path segment for an unknown URI', () => {
    expect(
      getProtocolName('https://example.com/protocols/messaging'),
    ).toBe('Messaging');
  });

  it('returns the title-cased last segment with hyphens replaced by spaces', () => {
    expect(
      getProtocolName('https://example.com/a/b/c/my-protocol'),
    ).toBe('My Protocol');
  });

  it('returns a title-cased fallback for an unknown protocol foundation URI', () => {
    expect(
      getProtocolName('https://identity.foundation/protocols/unknown-proto'),
    ).toBe('Unknown Proto');
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('title-cases the full string when there are no slashes', () => {
    expect(getProtocolName('just-a-string')).toBe('Just A String');
  });

  it('returns the URI itself for an empty string (no segments)', () => {
    expect(getProtocolName('')).toBe('');
  });

  it('returns the title-cased URI when the last segment is empty (trailing slash)', () => {
    // '...foo/'.split('/') → [..., ''], last is '' → fallback to full URI, title-cased
    expect(
      getProtocolName('https://example.com/foo/'),
    ).toBe('Https://Example.Com/Foo/');
  });

  it('handles a URI that is just a slash', () => {
    expect(getProtocolName('/')).toBe('/');
  });

  it('handles a URI with query parameters (no special parsing)', () => {
    expect(
      getProtocolName('https://example.com/proto?version=2'),
    ).toBe('Proto?Version=2');
  });
});

describe('getProtocolInfo', () => {
  it('returns full info for a known protocol', () => {
    const info = getProtocolInfo('https://enbox.id/protocols/cashu-wallet');
    expect(info.name).toBe('Cashu Wallet');
    expect(info.description).toContain('ecash');
  });

  it('returns a sensible fallback for an unknown protocol', () => {
    const info = getProtocolInfo('https://example.com/my-thing');
    expect(info.name).toBe('My Thing');
    expect(info.description).toContain('https://example.com/my-thing');
  });
});

describe('getScopeColor', () => {
  it('returns green for read', () => {
    expect(getScopeColor('Read')).toBe('green');
  });

  it('returns amber for write', () => {
    expect(getScopeColor('Write')).toBe('amber');
  });

  it('returns red for delete', () => {
    expect(getScopeColor('Delete')).toBe('red');
  });

  it('returns gray for unknown scopes', () => {
    expect(getScopeColor('Query')).toBe('gray');
    expect(getScopeColor('Subscribe')).toBe('gray');
    expect(getScopeColor('Configure')).toBe('gray');
    expect(getScopeColor('SomethingElse')).toBe('gray');
  });
});

describe('getScopeLabel', () => {
  it('uses friendly labels for supported record permissions', () => {
    expect(getScopeLabel({ interface: 'Records', method: 'Read' })).toBe('Read');
    expect(getScopeLabel({ interface: 'Records', method: 'Write' })).toBe('Write');
    expect(getScopeLabel({ interface: 'Records', method: 'Delete' })).toBe('Delete');
  });

  it('keeps unsupported and non-record scopes explicit', () => {
    expect(getScopeLabel({ interface: 'Records', method: 'Query' })).toBe('Records.Query');
    expect(getScopeLabel({ interface: 'Records', method: 'Subscribe' })).toBe('Records.Subscribe');
    expect(getScopeLabel({ interface: 'Protocols', method: 'Configure' })).toBe('Protocols.Configure');
  });
});
