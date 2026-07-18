import type { AudienceKeyDeliveryEntry } from '@/enbox/audience-key-delivery';

import { AlertTriangle, CheckCircle2, CircleHelp, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Loader } from '@/components/ui/Loader';
import {
  useAudienceKeyDeliveries,
  useRepairAudienceKeyDelivery,
} from '@/enbox/hooks/use-audience-key-delivery';
import { getProtocolName } from '@/lib/protocol-names';
import { truncateDid } from '@/lib/utils';

function statusPresentation(entry: AudienceKeyDeliveryEntry): {
  icon: typeof CheckCircle2;
  label: string;
  badgeClassName: string;
  description: string;
} {
  switch (entry.status.status) {
    case 'delivered':
      return {
        icon          : CheckCircle2,
        label         : 'Ready',
        badgeClassName: 'bg-success/10 text-success',
        description   : 'This role holder has the current key for encrypted shared records.',
      };

    case 'not-delivered':
      return {
        icon          : AlertTriangle,
        label         : 'Needs repair',
        badgeClassName: 'bg-error/10 text-error',
        description   : 'This role holder may be unable to open encrypted shared records.',
      };

    case 'unverifiable':
      return {
        icon          : CircleHelp,
        label         : 'Cannot verify',
        badgeClassName: 'bg-warning/10 text-warning',
        description   : entry.granteeDid
          ? 'This wallet is connected as a delegate, so delivery records are intentionally hidden.'
          : 'The wallet could not safely confirm whether the current key was delivered.',
      };
  }
}

function technicalReason(entry: AudienceKeyDeliveryEntry): string | undefined {
  return entry.status.status === 'delivered' ? undefined : entry.status.reason;
}

export function AudienceKeyDeliveryPanel({ did }: { did: string }) {
  const { data: entries, isLoading, isError, error } = useAudienceKeyDeliveries(did);
  const repair = useRepairAudienceKeyDelivery(did);

  if (isLoading) {
    return (
      <section
        aria-label="Encrypted collaboration access"
        className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4"
      >
        <Loader message="Checking encrypted collaboration access..." />
      </section>
    );
  }

  if (isError) {
    return (
      <section aria-label="Encrypted collaboration access">
        <ErrorAlert
          message={error instanceof Error
            ? `Encrypted access check failed: ${error.message}`
            : 'Encrypted access check failed'}
        />
      </section>
    );
  }

  if (!entries?.length) {
    return null;
  }

  async function handleRepair(entry: AudienceKeyDeliveryEntry): Promise<void> {
    try {
      const outcome = await repair.mutateAsync(entry);
      if (outcome.delivered) {
        toast.success(outcome.alreadyDelivered
          ? 'Encrypted access was already ready'
          : 'Encrypted access repaired');
      } else {
        toast.error(`Encrypted access could not be repaired: ${outcome.reason}`);
      }
    } catch (repairError) {
      toast.error(repairError instanceof Error
        ? repairError.message
        : 'Encrypted access could not be repaired');
    }
  }

  return (
    <section className="space-y-3" aria-label="Encrypted collaboration access">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">
            Encrypted collaboration access
          </h3>
        </div>
        <p className="mt-1 text-xs text-text-ghost">
          Checks that role holders received the current key needed to read encrypted shared records.
        </p>
      </div>

      <div className="space-y-2">
        {entries.map((entry) => {
          const presentation = statusPresentation(entry);
          const StatusIcon = presentation.icon;
          const reason = technicalReason(entry);
          const isRepairing = repair.isPending && repair.variables?.key === entry.key;
          const canRepair = entry.status.status === 'not-delivered' && !entry.granteeDid;

          return (
            <div
              key={entry.key}
              className="rounded-[var(--radius-lg)] border border-border-default bg-surface-1 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {getProtocolName(entry.protocol)}
                    </span>
                    <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-text-secondary">
                      {entry.rolePath}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${presentation.badgeClassName}`}>
                      <StatusIcon className="h-3 w-3" />
                      {presentation.label}
                    </span>
                  </div>

                  <p
                    className="mt-1 truncate font-mono text-xs text-text-secondary"
                    title={entry.recipientDid}
                  >
                    Role holder: {truncateDid(entry.recipientDid)}
                  </p>
                  <p className="mt-2 text-xs text-text-ghost">
                    {presentation.description}
                  </p>

                  {reason && (
                    <details className="mt-2 text-xs text-text-ghost">
                      <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
                        Technical details
                      </summary>
                      <p className="mt-1 break-words">{reason}</p>
                    </details>
                  )}
                </div>

                {canRepair && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRepair(entry)}
                    loading={isRepairing}
                    disabled={repair.isPending && !isRepairing}
                    className="shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Repair access
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
