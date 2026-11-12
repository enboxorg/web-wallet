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

/**
 * Get a human-friendly name for a module URI.
 * Falls back to the last path segment if the URI is unknown.
 */
export function getModuleName(uri: string): string {
  const info = MODULE_REGISTRY[uri];
  if (info) { return info.name; }
  const companionRoot = getContextCompanionRootUri(uri);
  if (companionRoot) {
    return `${getModuleName(companionRoot)} Contexts`;
  }
  // Fall back to last path segment, title-cased.
  const parts = uri.split('/');
  const last = parts[parts.length - 1] || uri;
  return last.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
