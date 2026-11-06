import { describe, it, expect } from 'vitest';

import {
  getCanonicalModuleDefinition,
  getModuleInfo,
  getModuleName,
  getScopeLabel,
} from '../module-names';

describe('getModuleName', () => {
  // ── Known module URIs ───────────────────────────────────────────

  it('returns "Profile" for the profile module URI', () => {
    expect(
      getModuleName('https://identity.foundation/modules/profile'),
    ).toBe('Profile');
  });

  it('returns "Connect" for the connect module URI', () => {
    expect(
      getModuleName('https://identity.foundation/modules/connect'),
    ).toBe('Connect');
  });

  it('returns "Cashu Wallet" for the cashu-wallet module URI', () => {
    expect(
      getModuleName('https://enbox.id/protocols/cashu-wallet'),
    ).toBe('Cashu Wallet');
  });

  it('returns "Cashu Transfers" for the cashu-transfer module URI', () => {
    expect(
      getModuleName('https://enbox.id/protocols/cashu-transfer'),
    ).toBe('Cashu Transfers');
  });

  // ── Unknown URIs fall back to title-cased last path segment ───────

  it('returns the title-cased last path segment for an unknown URI', () => {
    expect(
      getModuleName('https://example.com/modules/messaging'),
    ).toBe('Messaging');
  });

  it('returns the title-cased last segment with hyphens replaced by spaces', () => {
    expect(
      getModuleName('https://example.com/a/b/c/my-module'),
    ).toBe('My Module');
  });

  it('returns a title-cased fallback for an unknown module foundation URI', () => {
    expect(
      getModuleName('https://identity.foundation/modules/unknown-module'),
    ).toBe('Unknown Module');
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('title-cases the full string when there are no slashes', () => {
    expect(getModuleName('just-a-string')).toBe('Just A String');
  });

  it('returns the URI itself for an empty string (no segments)', () => {
    expect(getModuleName('')).toBe('');
  });

  it('returns the title-cased URI when the last segment is empty (trailing slash)', () => {
    // '...foo/'.split('/') → [..., ''], last is '' → fallback to full URI, title-cased
    expect(
      getModuleName('https://example.com/foo/'),
    ).toBe('Https://Example.Com/Foo/');
  });

  it('handles a URI that is just a slash', () => {
    expect(getModuleName('/')).toBe('/');
  });

  it('handles a URI with query parameters (no special parsing)', () => {
    expect(
      getModuleName('https://example.com/module?version=2'),
    ).toBe('Module?Version=2');
  });
});

describe('getModuleInfo', () => {
  it('returns full info for a known module', () => {
    const info = getModuleInfo('https://enbox.id/protocols/cashu-wallet');
    expect(info.name).toBe('Cashu Wallet');
    expect(info.description).toContain('ecash');
  });

  it('returns a sensible fallback for an unknown module', () => {
    const info = getModuleInfo('https://example.com/my-thing');
    expect(info.name).toBe('My Thing');
    expect(info.description).toContain('https://example.com/my-thing');
  });
});

describe('getCanonicalModuleDefinition', () => {
  it('pins the wallet-supported module definitions', () => {
    for (const name of ['profile', 'connect', 'preferences']) {
      const uri = `https://identity.foundation/modules/${name}`;
      expect(getCanonicalModuleDefinition(uri)?.module).toBe(uri);
    }
  });

  it('does not treat display-only Cashu metadata as a pinned definition', () => {
    expect(getCanonicalModuleDefinition('https://enbox.id/protocols/cashu-wallet')).toBeUndefined();
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
    expect(getScopeLabel({ interface: 'Modules', method: 'Configure' })).toBe('Modules.Configure');
  });
});
