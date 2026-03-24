import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Database } from 'lucide-react';
import { useAgent } from '@/enbox/hooks/use-agent';
import { queryKeys } from '@/enbox/queries/query-keys';
import { fetchWallets } from '@/enbox/queries/identity-queries';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

interface WalletsTabProps {
  did: string;
}

export default function WalletsTab({ did }: WalletsTabProps) {
  const agent = useAgent();

  const { data: wallets, isLoading } = useQuery({
    queryKey: queryKeys.identities.wallets(did),
    queryFn: () => fetchWallets(agent, did),
    enabled: !!did,
  });

  if (isLoading) {
    return <Loader message="Loading wallets..." />;
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
      {wallets.map((wallet: any, i: number) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-4 py-3"
        >
          <ExternalLink className="h-4 w-4 shrink-0 text-text-ghost" />
          <p className="min-w-0 flex-1 truncate text-sm text-text-primary">
            {wallet.url || wallet.host || JSON.stringify(wallet)}
          </p>
        </div>
      ))}
    </div>
  );
}
