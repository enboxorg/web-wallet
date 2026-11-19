import { useId, useMemo } from 'react';
import { Database, Globe, Lock, LockKeyhole } from 'lucide-react';
import type { DwnModuleDefinition } from '@enbox/agent';

import { useModules } from '@/enbox/hooks/use-modules';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { Disclosure } from '@/components/ui/Disclosure';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ModuleGlyph } from '@/components/modules/ModuleGlyph';
import { describeModule, getModuleName, type ModuleDisplay } from '@/lib/module-names';
import { collectStructurePaths, getModuleTypes } from '@/lib/module-structure';

interface ModulesTabProps {
  did: string;
}

interface InstalledModule {
  uri: string;
  published: boolean;
  definition?: DwnModuleDefinition;
}

interface ModuleRowModel {
  module: InstalledModule;
  display: ModuleDisplay;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** By name, with each companion right after its root. */
function sortRows(rows: ModuleRowModel[]): ModuleRowModel[] {
  const sortKey = (row: ModuleRowModel): string => {
    const root = row.display.companionOf;
    const base = root ? getModuleName(root) : row.display.name;
    return `${base.toLowerCase()}\u0000${root ? 1 : 0}\u0000${row.module.uri}`;
  };
  return [...rows].sort((left, right) => sortKey(left).localeCompare(sortKey(right)));
}

function ModuleRow({ row }: { row: ModuleRowModel }) {
  const { module, display } = row;
  const types = getModuleTypes(module.definition);
  const encryptedCount = types.filter((type) => type.encrypted).length;
  const paths = collectStructurePaths(
    module.definition?.structure as Record<string, unknown> | undefined,
  );
  const uses = Object.entries(module.definition?.uses ?? {});

  const meta = [
    display.isCore ? display.description : display.host,
    display.version,
    types.length > 0 ? pluralize(types.length, 'type') : undefined,
  ].filter(Boolean).join(' · ');

  return (
    <li>
      <Disclosure
        summaryClassName="px-4 py-3 text-text-secondary hover:bg-surface-2/60"
        aria-label={`${display.name} module`}
        summary={(
          <>
            <ModuleGlyph module={display} />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-sm font-semibold text-text-primary" title={module.uri}>
                  {display.companionOf ? getModuleName(display.companionOf) : display.name}
                </span>
                {display.companionOf && <Badge tone="info">Shared contexts</Badge>}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-normal text-text-tertiary">
                <span className="truncate">{meta}</span>
                {encryptedCount > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-text-tertiary">
                    <LockKeyhole className="size-3" aria-hidden="true" />
                    {encryptedCount === types.length ? 'Encrypted' : `${encryptedCount} encrypted`}
                  </span>
                )}
              </span>
            </span>
            {module.published ? (
              <Badge
                icon={<Globe />}
                title="Anyone can look up this module's definition. Your records stay private unless you publish them."
              >
                Published
              </Badge>
            ) : (
              <Badge
                variant="outline"
                icon={<Lock />}
                title="Only you and apps you approve can look up this module's definition."
              >
                Private
              </Badge>
            )}
          </>
        )}
        contentClassName="space-y-4 border-t border-border-subtle bg-surface-0/40 px-4 py-4 sm:pl-[4.25rem]"
      >
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Module URI</p>
          <div className="flex min-w-0 items-center gap-1 rounded-lg bg-surface-2 py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary" title={module.uri}>
              {module.uri}
            </code>
            <CopyButton value={module.uri} label={`Copy ${display.name} module URI`} />
          </div>
        </div>

        {types.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Data types</p>
            <div className="flex flex-wrap gap-1.5">
              {types.map((type) => (
                <Badge
                  key={type.name}
                  variant="outline"
                  className="font-mono"
                  icon={type.encrypted ? <LockKeyhole aria-label="Encrypted" /> : undefined}
                  title={type.encrypted ? `${type.name} records are always encrypted` : undefined}
                >
                  {type.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {paths.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Record paths</p>
            <div className="flex flex-wrap gap-1.5">
              {paths.map((path) => (
                <Badge key={path} variant="outline" className="font-mono">{path}</Badge>
              ))}
            </div>
          </div>
        )}

        {uses.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-ghost">Builds on</p>
            <ul className="flex flex-wrap gap-1.5">
              {uses.map(([alias, uri]) => (
                <li key={alias}>
                  <Badge variant="outline" title={uri}>{getModuleName(uri)}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Disclosure>
    </li>
  );
}

function ModuleSection({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: ModuleRowModel[];
}) {
  const headingId = useId();
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3" aria-labelledby={headingId}>
      <SectionHeader id={headingId} title={title} description={description} count={rows.length} />
      <ul className="surface-card divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-default bg-surface-1">
        {rows.map((row) => <ModuleRow key={row.module.uri} row={row} />)}
      </ul>
    </section>
  );
}

export default function ModulesTab({ did }: ModulesTabProps) {
  const { data: modules, isLoading, isError, error } = useModules(did);

  const { core, apps } = useMemo(() => {
    const rows = sortRows((modules ?? []).map((module) => ({
      module,
      display: describeModule(module.uri, module.definition),
    })));
    return {
      core : rows.filter((row) => row.display.isCore),
      apps : rows.filter((row) => !row.display.isCore),
    };
  }, [modules]);

  if (isLoading) {
    return <Loader message="Loading modules..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  if (!modules || modules.length === 0) {
    return (
      <EmptyState
        icon={<Database />}
        title="No modules installed"
        description="Modules define the data types and access rules your apps use. They are added when you approve an app."
      />
    );
  }

  return (
    <div className="space-y-8">
      <ModuleSection
        title="Third-party modules"
        description="Defined by apps you approved, not built into the wallet. Each is identified by its module URI."
        rows={apps}
      />
      <ModuleSection
        title="Core modules"
        description="Built into every Enbox profile."
        rows={core}
      />
    </div>
  );
}
