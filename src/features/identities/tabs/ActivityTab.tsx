import { useQuery } from '@tanstack/react-query';
import { Clock, Globe, FileText, AlertCircle } from 'lucide-react';
import { useAgent } from '@/enbox/hooks/use-agent';
import { queryKeys } from '@/enbox/queries/query-keys';
import { fetchActivity, type ActivityRecord } from '@/enbox/queries/identity-queries';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { truncateDid, formatRelativeTime } from '@/lib/utils';

interface ActivityTabProps {
  did: string;
}

export default function ActivityTab({ did }: ActivityTabProps) {
  const agent = useAgent();

  const { data: activity, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.identities.activity(did),
    queryFn: () => fetchActivity(agent, did),
    enabled: !!did,
  });

  if (isLoading) {
    return <Loader message="Loading activity..." />;
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

  if (!activity || activity.length === 0) {
    return (
      <EmptyState
        icon={<Clock />}
        title="No recent activity"
        description="Records created in the last 7 days will appear here."
      />
    );
  }

  return (
    <div className="space-y-1">
      {activity.map((item: ActivityRecord) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border-default bg-surface-1 px-4 py-3"
        >
          {/* Icon */}
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-ghost" />

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-text-primary">
                {item.protocol
                  ? item.protocol.split('/').pop() || 'Unknown'
                  : 'Unknown'}
              </span>
              {item.published && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  <Globe className="h-3 w-3" />
                  Published
                </span>
              )}
            </div>

            {item.protocolPath && (
              <p className="mt-0.5 truncate font-mono text-xs text-text-tertiary">
                {item.protocolPath}
              </p>
            )}

            <div className="mt-1 flex items-center gap-3 text-xs text-text-ghost">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(item.dateCreated)}
              </span>
              <span className="truncate">
                {truncateDid(item.author)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
