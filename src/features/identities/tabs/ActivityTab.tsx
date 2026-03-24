import { useQuery } from '@tanstack/react-query';
import { Clock, Globe, FileText, User, Users, Link2 } from 'lucide-react';
import { useAgent } from '@/enbox/hooks/use-agent';
import { queryKeys } from '@/enbox/queries/query-keys';
import { fetchActivity, type ActivityRecord } from '@/enbox/queries/identity-queries';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { truncateDid, formatRelativeTime } from '@/lib/utils';

function getProtocolIcon(protocol?: string) {
  if (!protocol) return <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-ghost" />;
  if (protocol.includes('profile')) return <User className="mt-0.5 h-4 w-4 shrink-0 text-text-ghost" />;
  if (protocol.includes('social-graph')) return <Users className="mt-0.5 h-4 w-4 shrink-0 text-text-ghost" />;
  if (protocol.includes('connect')) return <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-text-ghost" />;
  return <FileText className="mt-0.5 h-4 w-4 shrink-0 text-text-ghost" />;
}

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
    return <ErrorAlert message={error instanceof Error ? error.message : 'Failed to load data'} />;
  }

  if (!activity || activity.length === 0) {
    return (
      <EmptyState
        icon={<Clock />}
        title="No recent activity"
        description="DWN records for this identity will appear here once data is synced."
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
          {getProtocolIcon(item.protocol)}

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
