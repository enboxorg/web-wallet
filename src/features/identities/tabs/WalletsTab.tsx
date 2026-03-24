import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Database } from 'lucide-react';
import { useAgent } from '@/enbox/hooks/use-agent';
import { queryKeys } from '@/enbox/queries/query-keys';
import { fetchWallets } from '@/enbox/queries/identity-queries';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';

interface WalletsTabProps {
  did: string;
}

export default function WalletsTab({ did }: WalletsTabProps) {
  const agent = useAgent();

  const { data: wallets, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.identities.wallets(did),
    queryFn: () => fetchWallets(agent, did),
    enabled: !!did,
  });

  if (isLoading) {
    return <Loader message="Loading wallets..." />;
  }

  if (isError) {
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  if (!wallets || wallets.length === 0) {
    return (
      <EmptyState
        icon={<Database />}
        title="No wallet connections"
        description="Wallet records appear here when you connect to web wallet hosts."
      />
    );
  }

  return (
    <div className="space-y-2">
      {wallets.map((wallet: any, i: number) => {
        const urls = wallet.webWallets ?? wallet.urls ?? [];
        const displayUrl = wallet.url || wallet.host || (urls.length > 0 ? urls[0] : null);

        return (
          <div
            key={i}
            className="rounded-lg border border-border-default bg-surface-1 px-4 py-3"
          >
            {displayUrl ? (
              <div className="flex items-center gap-3">
                <ExternalLink className="h-4 w-4 shrink-0 text-text-ghost" />
                <p className="min-w-0 flex-1 truncate text-sm text-text-primary">
                  {displayUrl}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-text-secondary">Wallet record</p>
                <pre className="overflow-x-auto rounded bg-surface-2 p-2 font-mono text-xs text-text-tertiary">
                  {JSON.stringify(wallet, null, 2)}
                </pre>
              </div>
            )}
            {urls.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {urls.slice(1).map((url: string, j: number) => (
                  <span key={j} className="text-xs text-text-tertiary">{url}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
