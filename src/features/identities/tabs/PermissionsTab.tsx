import { useMemo, useState } from 'react';
import { Shield, Copy, Check, AlertCircle } from 'lucide-react';
import { usePermissions } from '@/enbox/hooks/use-permissions';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';
import { truncateDid, copyToClipboard } from '@/lib/utils';

interface PermissionsTabProps {
  did: string;
}

export default function PermissionsTab({ did }: PermissionsTabProps) {
  const { data: permissions, isLoading, isError, error } = usePermissions(did);
  const [copiedDid, setCopiedDid] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (!permissions) return {};
    return permissions.reduce((acc: Record<string, any[]>, grant: any) => {
      const grantee = grant.grantee || 'unknown';
      if (!acc[grantee]) acc[grantee] = [];
      acc[grantee].push(grant);
      return acc;
    }, {});
  }, [permissions]);

  if (isLoading) {
    return <Loader message="Loading permissions..." />;
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

  const grantees = Object.keys(grouped);

  if (grantees.length === 0) {
    return (
      <EmptyState
        icon={<Shield />}
        title="No permissions granted"
        description="Permission grants from apps and services will appear here."
      />
    );
  }

  const handleCopy = async (value: string) => {
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedDid(value);
      setTimeout(() => setCopiedDid(null), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {grantees.map((grantee) => (
        <div
          key={grantee}
          className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4"
        >
          {/* Grantee header */}
          <div className="mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 text-accent" />
            <span className="font-mono text-sm text-text-primary">
              {truncateDid(grantee)}
            </span>
            <button
              onClick={() => handleCopy(grantee)}
              className="ml-1 text-text-ghost hover:text-text-secondary"
              aria-label="Copy DID"
            >
              {copiedDid === grantee ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Grants */}
          <div className="space-y-2">
            {grouped[grantee].map((grant: any, i: number) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-secondary">
                  {grant.scope?.protocol || 'All protocols'}
                </span>
                {grant.scope?.interface && (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {grant.scope.interface}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
