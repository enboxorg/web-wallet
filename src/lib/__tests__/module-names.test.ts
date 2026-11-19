import { describe, it, expect } from 'vitest';

import {
  createCanonicalContextCompanionDefinition,
  getCanonicalModuleDefinition,
  getContextCompanionRootUri,
  getModuleInfo,
  getModuleName,
  getScopeLabel,
  humanizeSlug,
  isContextCompanionDefinition,
  parseModuleUri,
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

  it('ignores a trailing slash', () => {
    expect(
      getModuleName('https://example.com/foo/'),
    ).toBe('Foo');
  });

  it('handles a URI that is just a slash', () => {
    expect(getModuleName('/')).toBe('/');
  });

  it('ignores query parameters when naming', () => {
    expect(
      getModuleName('https://example.com/notes?version=2'),
    ).toBe('Notes');
  });

  // ── Versioned and namespaced URIs ────────────────────────────────

  it('skips trailing version segments instead of naming the module "V1"', () => {
    expect(getModuleName('https://enbox.id/modules/stock-watchlists/v1')).toBe('Stock Watchlists');
    expect(getModuleName('https://enbox.id/modules/media-library/v2')).toBe('Media Library');
    expect(getModuleName('https://example.com/modules/notes/1.0.0')).toBe('Notes');
    expect(getModuleName('https://example.com/modules/notes/v2beta1')).toBe('Notes');
  });

  it('keeps the parent segment when the leaf is not descriptive on its own', () => {
    expect(getModuleName('https://example.org/modules/notes/core/v1')).toBe('Notes Core');
    expect(getModuleName('https://example.org/modules/projects/boards/v1')).toBe('Boards');
  });

  it('falls back to the host when the path has no descriptive segment', () => {
    expect(getModuleName('https://notes.example/v1')).toBe('notes.example');
    expect(getModuleName('https://notes.example/modules/')).toBe('notes.example');
  });

  it('names versioned companion modules after their root', () => {
    expect(getModuleName('https://enbox.id/modules/notes/v1/contexts')).toBe('Notes Contexts');
  });

  it('splits camelCase and underscores', () => {
    expect(getModuleName('https://example.com/mediaLibrary')).toBe('Media Library');
    expect(getModuleName('https://example.com/stock_watchlists/v3')).toBe('Stock Watchlists');
  });

  it('names opaque URIs from their path', () => {
    expect(getModuleName('urn:enbox:notes:v1')).toBe('Notes');
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

describe('parseModuleUri', () => {
  it('extracts host, version, descriptive slugs, and a compact URI', () => {
    expect(parseModuleUri('https://enbox.id/modules/stock-watchlists/v1')).toEqual({
      host     : 'enbox.id',
      version  : 'v1',
      slugs    : ['stock-watchlists'],
      shortUri : 'enbox.id/modules/stock-watchlists/v1',
    });
  });

  it('handles unversioned and non-URL input', () => {
    expect(parseModuleUri('https://identity.foundation/modules/profile')).toMatchObject({
      host    : 'identity.foundation',
      version : undefined,
      slugs   : ['profile'],
    });
    expect(parseModuleUri('just-a-string')).toEqual({
      host     : undefined,
      version  : undefined,
      slugs    : ['just-a-string'],
      shortUri : 'just-a-string',
    });
  });
});

describe('humanizeSlug', () => {
  it('title-cases separators and camelCase', () => {
    expect(humanizeSlug('stock-watchlists')).toBe('Stock Watchlists');
    expect(humanizeSlug('mediaLibrary')).toBe('Media Library');
    expect(humanizeSlug('a__b--c')).toBe('A B C');
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
