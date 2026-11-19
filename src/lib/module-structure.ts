import type { DwnModuleDefinition } from '@enbox/agent';

/**
 * Record paths declared by a module structure (`notebook`, `notebook/note`).
 * Paths that only reference another module (`$ref`) are not local paths.
 */
export function collectStructurePaths(
  structure: Record<string, unknown> | undefined,
  prefix = '',
): string[] {
  if (!structure) return [];

  const paths: string[] = [];
  for (const [key, value] of Object.entries(structure)) {
    const path = prefix ? `${prefix}/${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const child = value as Record<string, unknown>;
      if (child.$ref === undefined) paths.push(path);
      const childStructure = Object.fromEntries(
        Object.entries(child).filter(([childKey, childValue]) =>
          !childKey.startsWith('$')
          && childValue
          && typeof childValue === 'object'
          && !Array.isArray(childValue)
        ),
      );
      paths.push(...collectStructurePaths(childStructure, path));
    }
  }

  return paths;
}

export function isEncryptedType(type: unknown): boolean {
  return Boolean(
    type
    && typeof type === 'object'
    && 'encryptionRequired' in type
    && type.encryptionRequired === true
  );
}

export interface ModuleTypeSummary {
  name: string;
  encrypted: boolean;
}

export function getModuleTypes(definition: Pick<DwnModuleDefinition, 'types'> | undefined): ModuleTypeSummary[] {
  return Object.entries(definition?.types ?? {}).map(([name, type]) => ({
    name,
    encrypted: isEncryptedType(type),
  }));
}
