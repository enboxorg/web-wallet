import type { DwnModuleDefinition } from '@enbox/agent';
import { authoredModuleDefinitionsEqual } from '@enbox/dwn-sdk-js';

import {
  ConnectDefinition,
  PreferencesDefinition,
  ProfileDefinition,
} from '@enbox/modules';

/** Metadata for a known module. */
export interface ModuleInfo {
  /** Human-friendly display name. */
  name: string;
  /** Short description of what the module manages. */
  description: string;
}

/** Registry of known module URIs with human-friendly metadata. */
const MODULE_REGISTRY: Record<string, ModuleInfo> = {
  // ─── Identity Foundation modules ──────────────────────────────
  [ProfileDefinition.module]: {
    name        : 'Profile',
    description : 'Public profile data such as display name, bio, and avatar',
  },
  [ConnectDefinition.module]: {
    name        : 'Connect',
    description : 'Wallet discovery and connection records',
  },
  [PreferencesDefinition.module]: {
    name        : 'Preferences',
    description : 'Theme, locale, privacy, and notification preferences',
  },
};

const CANONICAL_MODULE_DEFINITIONS = new Map<string, DwnModuleDefinition>([
  [ProfileDefinition.module, ProfileDefinition as DwnModuleDefinition],
  [ConnectDefinition.module, ConnectDefinition as DwnModuleDefinition],
  [PreferencesDefinition.module, PreferencesDefinition as DwnModuleDefinition],
]);

export function getCanonicalModuleDefinition(uri: string): DwnModuleDefinition | undefined {
  return CANONICAL_MODULE_DEFINITIONS.get(uri);
}

export function isCanonicalModuleDefinition(definition: DwnModuleDefinition): boolean {
  const canonical = CANONICAL_MODULE_DEFINITIONS.get(definition.module);
  return canonical !== undefined && authoredModuleDefinitionsEqual(canonical, definition);
}

/** Construct the exact `@enbox/contexts` companion definition for `moduleUri`. */
export function createCanonicalContextCompanionDefinition(moduleUri: string): DwnModuleDefinition {
  return {
    module    : moduleUri,
    published : true,
    types     : {
      invitation: {
        schema      : 'https://enbox.id/schemas/context-invitation',
        dataFormats : ['application/json'],
      },
      follow: {
        schema             : 'https://enbox.id/schemas/context-follow',
        dataFormats        : ['application/json'],
        encryptionRequired : true,
      },
    },
    structure: {
      invitation: {
        $immutable : true,
        $size      : { max: 8192 },
        $actions   : [{ who: 'anyone', can: ['create'] }],
      },
      follow: {
        $immutable : true,
        $size      : { max: 8192 },
      },
    },
  };
}

/**
 * True only when `definition` matches the exact canonical `@enbox/contexts`
 * companion contract (open-write `invitation` inbox + encrypted `follow`
 * journal). Never trusts a `/contexts` URI suffix alone.
 */
export function isContextCompanionDefinition(definition: DwnModuleDefinition): boolean {
  if (!definition?.module) return false;
  return authoredModuleDefinitionsEqual(
    definition,
    createCanonicalContextCompanionDefinition(definition.module),
  );
}

/**
 * Extract the conventional base module URI when a companion URI ends in
 * `/<segment>/contexts` (for example `https://app.example/modules/notes/contexts`
 * -> `https://app.example/modules/notes`).
 */
export function getContextCompanionRootUri(uri: string): string | undefined {
  if (!uri.endsWith('/contexts')) return undefined;
  try {
    const parsed = new URL(uri);
    if (parsed.search || parsed.hash) return undefined;
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length < 2 || segments[segments.length - 1] !== 'contexts') {
      return undefined;
    }
    parsed.pathname = `/${segments.slice(0, -1).join('/')}`;
    return parsed.href;
  } catch {
    return undefined;
  }
}

/** Whether the module URI has curated wallet display metadata. */
export function isKnownModule(uri: string): boolean {
  return uri in MODULE_REGISTRY;
}

/** Structural display facts parsed from a module URI. */
export interface ModuleUriParts {
  /** Host that namespaces the URI (e.g. `enbox.id`). A naming convention, not proof of authorship. */
  host?: string;
  /** Trailing version segment such as `v1` or `2.0`, when present. */
  version?: string;
  /** Path segments that describe the data, without version or generic `modules/` segments. */
  slugs: string[];
  /** Compact form for secondary display: `enbox.id/modules/notes/v1`. */
  shortUri: string;
}

/** Path segments that only organise URIs and never describe the data. */
const GENERIC_SEGMENTS = new Set([
  'module', 'modules', 'protocol', 'protocols', 'schema', 'schemas',
]);

/** `v1`, `v2beta`, `v1.2.0`, or a bare dotted `1.0` / `2.0.1`. */
const VERSION_SEGMENT = /^(v\d+(?:[._-]?[a-z0-9]+)*|\d+(?:\.\d+)+)$/i;

/**
 * Leaf segments too generic to stand alone as a name; the parent segment is
 * kept for context (`notes/core` → "Notes Core", not "Core").
 */
const NON_DESCRIPTIVE_LEAVES = new Set([
  'api', 'app', 'base', 'common', 'core', 'data', 'default', 'index', 'main', 'root', 'shared',
]);

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Parse a module URI into display parts without trusting any of it. */
export function parseModuleUri(uri: string): ModuleUriParts {
  let host: string | undefined;
  let segments: string[];
  let shortUri = uri;

  try {
    const url = new URL(uri);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      host = url.host || undefined;
      segments = url.pathname.split('/').filter(Boolean).map(decodeSegment);
      shortUri = `${url.host}${url.pathname.replace(/\/+$/, '')}`;
    } else {
      // Opaque URIs (urn:, did:, …) carry their structure in the path.
      segments = url.pathname.split(/[/:]/).filter(Boolean).map(decodeSegment);
    }
  } catch {
    segments = uri.split('/').filter(Boolean);
  }

  let version: string | undefined;
  const slugs: string[] = [];
  for (const segment of segments) {
    if (VERSION_SEGMENT.test(segment)) {
      version = segment;
      continue;
    }
    if (GENERIC_SEGMENTS.has(segment.toLowerCase())) {
      continue;
    }
    slugs.push(segment);
  }

  return { host, version, slugs, shortUri };
}

/** `stock-watchlists` → "Stock Watchlists", `mediaLibrary` → "Media Library". */
export function humanizeSlug(slug: string): string {
  return slug
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.+~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|\s)(\S)/g, (_match, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

function nameFromSlugs(slugs: string[]): string | undefined {
  if (slugs.length === 0) return undefined;
  const leaf = slugs[slugs.length - 1];
  if (slugs.length > 1 && NON_DESCRIPTIVE_LEAVES.has(leaf.toLowerCase())) {
    return humanizeSlug(`${slugs[slugs.length - 2]} ${leaf}`);
  }
  return humanizeSlug(leaf);
}

/**
 * Name a module purely from its own URI (`…/stock-watchlists/v1` → "Stock
 * Watchlists"), ignoring the curated registry and the `/contexts` companion
 * convention. This is what the URI's author called it — never a wallet-vouched
 * name — so always show it alongside the URI's host.
 */
export function nameFromModuleUri(uri: string): string {
  const { host, slugs } = parseModuleUri(uri);
  return nameFromSlugs(slugs) ?? host ?? uri;
}

/**
 * Get a human-friendly name for a module URI.
 *
 * Curated names are used for wallet-known modules. Otherwise the name is
 * derived from the most descriptive path segment, skipping version segments
 * (`/v1`) and organisational segments (`/modules`), so
 * `https://enbox.id/modules/stock-watchlists/v1` reads "Stock Watchlists".
 * A derived name is display text only — pair it with {@link parseModuleUri}'s
 * host wherever provenance matters.
 */
export function getModuleName(uri: string): string {
  const info = MODULE_REGISTRY[uri];
  if (info) { return info.name; }
  const companionRoot = getContextCompanionRootUri(uri);
  if (companionRoot) {
    return `${getModuleName(companionRoot)} Contexts`;
  }
  return nameFromModuleUri(uri);
}

/** Everything a management view needs to label a module consistently. */
export interface ModuleDisplay {
  uri: string;
  name: string;
  /** Curated description, only for wallet-known modules. */
  description?: string;
  host?: string;
  version?: string;
  shortUri: string;
  /** Curated wallet module (Profile, Connect, Preferences). */
  isCore: boolean;
  /**
   * Root module URI, set only when the installed definition is the exact
   * `@enbox/contexts` companion contract — a `/contexts` URI suffix alone is
   * never trusted.
   */
  companionOf?: string;
}

/**
 * Display facts for a module. Pass the installed definition when available:
 * without it a module is never presented as a shared-contexts companion.
 */
export function describeModule(uri: string, definition?: DwnModuleDefinition): ModuleDisplay {
  const info = MODULE_REGISTRY[uri];
  const parts = parseModuleUri(uri);
  return {
    uri,
    name        : getModuleName(uri),
    description : info?.description,
    host        : parts.host,
    version     : parts.version,
    shortUri    : parts.shortUri,
    isCore      : info !== undefined,
    companionOf : !info && definition !== undefined && isContextCompanionDefinition(definition)
      ? getContextCompanionRootUri(uri)
      : undefined,
  };
}

/**
 * Get the full module info for a URI, or a sensible fallback.
 */
export function getModuleInfo(uri: string): ModuleInfo {
  const info = MODULE_REGISTRY[uri];
  if (info) { return info; }
  return {
    name        : getModuleName(uri),
    description : `Module at ${uri}`,
  };
}

/** Human-readable label for a DWN permission scope interface + method. */
export function getScopeLabel(scope: { interface: string; method: string }): string {
  const method = scope.method;
  if (scope.interface === 'Records') {
    switch (method) {
      case 'Write':  return 'Write';
      case 'Read':   return 'Read';
      case 'Delete': return 'Delete';
      default:       return `${scope.interface}.${method}`;
    }
  }

  return `${scope.interface}.${method}`;
}
