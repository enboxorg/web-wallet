import { Globe, Lock, Database, AlertCircle } from 'lucide-react';
import { useProtocols } from '@/enbox/hooks/use-protocols';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

interface ProtocolsTabProps {
  did: string;
}

export default function ProtocolsTab({ did }: ProtocolsTabProps) {
  const { data: protocols, isLoading, isError, error } = useProtocols(did);

  if (isLoading) {
    return <Loader message="Loading protocols..." />;
  }

  if (isError) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-4" role="alert">
        <AlertCircle className="h-5 w-5 text-error shrink-0 mt-0.5" />
        <p className="text-sm text-error">
          {error instanceof Error ? error.message : 'Failed to load data'}
        </p>
      </div>
    );
  }

  if (!protocols || protocols.length === 0) {
    return (
      <EmptyState
        icon={<Database />}
        title="No protocols installed"
        description="Protocols define the data schemas and rules for your decentralized apps."
      />
    );
  }

  return (
    <div className="space-y-2">
      {protocols.map((protocol) => (
        <div
          key={protocol.uri}
          className="flex items-center justify-between gap-4 rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-4 py-3"
        >
          <p className="min-w-0 flex-1 truncate font-mono text-sm text-text-primary">
            {protocol.uri}
          </p>
          {protocol.published ? (
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
