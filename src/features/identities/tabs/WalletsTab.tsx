import { ExternalLink, Database } from 'lucide-react';
import { useWallets } from '@/enbox/hooks/use-wallets';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';

interface WalletsTabProps {
  did: string;
}

export default function WalletsTab({ did }: WalletsTabProps) {
  const { wallets, loading, empty, error } = useWallets(did);

  if (loading) {
    return <Loader message="Loading wallets..." />;
  }

  if (error) {
    return <ErrorAlert message={error.message} />;
  }

  if (empty) {
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
      {wallets.map((wallet, i) => {
        const urls = wallet.webWallets;
        const displayUrl = urls[0];

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
