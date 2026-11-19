import { useQuery } from '@tanstack/react-query';
import { Clock, FileText, Globe } from 'lucide-react';
import { useAgent } from '@/enbox/hooks/use-agent';
import { queryKeys } from '@/enbox/queries/query-keys';
import { fetchActivity, type ActivityRecord } from '@/enbox/queries/identity-queries';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Badge } from '@/components/ui/Badge';
import { Monogram } from '@/components/ui/Monogram';
import { ModuleGlyph } from '@/components/modules/ModuleGlyph';
import { describeModule } from '@/lib/module-names';
import { truncateDid, formatRelativeTime } from '@/lib/utils';

interface ActivityTabProps {
  did: string;
}

function ActivityRow({ item, ownerDid }: { item: ActivityRecord; ownerDid: string }) {
  const display = item.module ? describeModule(item.module) : undefined;
  const authoredByOwner = item.author === ownerDid;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {display ? (
        <ModuleGlyph module={display} size="sm" />
      ) : (
        <Monogram label="Record" icon={<FileText />} size="sm" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-text-primary" title={item.module}>
            {display?.name ?? 'Unknown module'}
          </span>
          {item.published && (
            <Badge tone="accent" icon={<Globe />}>Published</Badge>
          )}
        </div>

        {item.modulePath && (
          <p className="mt-0.5 truncate font-mono text-xs text-text-tertiary">{item.modulePath}</p>
        )}

        <p className="mt-1 truncate text-xs text-text-ghost">
          {authoredByOwner ? 'By you' : <>By <span className="font-mono" title={item.author}>{truncateDid(item.author)}</span></>}
        </p>
      </div>

      <time
        dateTime={item.dateCreated}
        title={new Date(item.dateCreated).toLocaleString()}
        className="flex shrink-0 items-center gap-1 text-xs text-text-ghost"
      >
        <Clock className="size-3" aria-hidden="true" />
        {formatRelativeTime(item.dateCreated)}
      </time>
    </li>
  );
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
        description="Activity for this profile will appear here once data syncs."
      />
    );
  }

  return (
    <ul
      aria-label="Recent activity"
      className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-default bg-surface-1"
    >
      {activity.map((item: ActivityRecord) => (
        <ActivityRow key={item.id} item={item} ownerDid={did} />
      ))}
    </ul>
  );
}
