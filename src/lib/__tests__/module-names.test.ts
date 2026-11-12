import { describe, it, expect } from 'vitest';

import {
  createCanonicalContextCompanionDefinition,
  getCanonicalModuleDefinition,
  getContextCompanionRootUri,
  getModuleInfo,
  getModuleName,
  getScopeLabel,
  isContextCompanionDefinition,
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

  it('returns "Preferences" for the preferences module URI', () => {
    expect(
      getModuleName('https://identity.foundation/modules/preferences'),
    ).toBe('Preferences');
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

  it('derives "<Base> Contexts" for conventional companion module URIs', () => {
    expect(
      getModuleName('https://example.com/modules/notes/contexts'),
    ).toBe('Notes Contexts');
    expect(
      getModuleName('https://identity.foundation/modules/profile/contexts'),
    ).toBe('Profile Contexts');
  });

  it('falls back to "Contexts" when /contexts has no parent path segment', () => {
    expect(
      getModuleName('https://example.com/contexts'),
    ).toBe('Contexts');
  });
});

describe('getModuleInfo', () => {
  it('returns full info for a known module', () => {
    const info = getModuleInfo('https://identity.foundation/modules/profile');
    expect(info.name).toBe('Profile');
    expect(info.description).toContain('profile');
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

  it('returns undefined for unpinned custom module URIs', () => {
    expect(getCanonicalModuleDefinition('https://example.com/modules/notes')).toBeUndefined();
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

describe('context companion helpers', () => {
  const companionUri = 'https://example.com/modules/notes/contexts';

  it('extracts the base module URI from conventional /contexts URIs', () => {
    expect(getContextCompanionRootUri(companionUri)).toBe('https://example.com/modules/notes');
    expect(getContextCompanionRootUri('https://example.com/contexts')).toBeUndefined();
    expect(getContextCompanionRootUri(`${companionUri}?v=2`)).toBeUndefined();
    expect(getContextCompanionRootUri(`${companionUri}#frag`)).toBeUndefined();
    expect(getContextCompanionRootUri('https://example.com/modules/notes')).toBeUndefined();
  });

  it('accepts only the exact canonical @enbox/contexts companion definition', () => {
    const canonical = createCanonicalContextCompanionDefinition(companionUri);
    expect(isContextCompanionDefinition(canonical)).toBe(true);

    expect(isContextCompanionDefinition({
      ...canonical,
      published: false,
    })).toBe(false);

    expect(isContextCompanionDefinition({
      ...canonical,
      types: {
        ...canonical.types,
        follow: {
          schema      : 'https://enbox.id/schemas/context-follow',
          dataFormats : ['application/json'],
        },
      },
    })).toBe(false);

    expect(isContextCompanionDefinition({
      ...canonical,
      structure: {
        ...canonical.structure,
        follow: {
          ...canonical.structure.follow,
          $actions: [{ who: 'anyone', can: ['read'] }],
        },
      },
    })).toBe(false);

    expect(isContextCompanionDefinition({
      ...canonical,
      types: {
        ...canonical.types,
        secret: { schema: 'https://evil.example/secret' },
      },
    })).toBe(false);
  });
});
