import { Globe, Lock, Database } from 'lucide-react';
import { useModules } from '@/enbox/hooks/use-modules';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { getModuleName } from '@/lib/module-names';

interface ModulesTabProps {
  did: string;
}

export default function ModulesTab({ did }: ModulesTabProps) {
  const { data: modules, isLoading, isError, error } = useModules(did);

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
        description="Modules define the data schemas and rules for your decentralized apps."
      />
    );
  }

  return (
    <div className="space-y-2">
      {modules.map((module) => (
        <div
          key={module.uri}
          className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-4 py-3"
        >
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-text-primary" title={module.uri}>
            {getModuleName(module.uri)}
          </p>
          {module.published ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
              <Globe className="h-3 w-3" />
              Published
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              <Lock className="h-3 w-3" />
              Private
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
