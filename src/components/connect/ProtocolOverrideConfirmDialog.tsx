/**
 * Final confirmation before the wallet replaces one or more installed protocol
 * definitions during a connect approval override. The opt-in checkbox in
 * {@link PermissionDisplay} unlocks approval; this dialog is the last gate,
 * spelling out exactly which protocols will be replaced before the owner
 * reconfigure runs.
 */
import { RefreshCw } from 'lucide-react';

import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { getProtocolName } from '@/lib/protocol-names';

interface ProtocolOverrideConfirmDialogProps {
  open: boolean;
  /** URIs of the protocols that will be replaced. */
  protocols: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ProtocolOverrideConfirmDialog({
  open,
  protocols,
  onConfirm,
  onCancel,
}: ProtocolOverrideConfirmDialogProps) {
  const many = protocols.length > 1;

  return (
    <Dialog open={open} onClose={onCancel} title="Replace installed protocol setup?">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-text-secondary">
          The wallet will replace {many ? 'these installed protocol definitions' : 'this installed protocol definition'} with
          the app&apos;s version on this profile and its DWN endpoints before connecting. This change is
          kept even if the connection does not finish.
        </p>

        <ul className="space-y-2">
          {protocols.map((uri) => (
            <li key={uri} className="rounded-lg border border-border-default bg-surface-1 px-3 py-2">
              <p className="text-sm font-medium text-text-primary">{getProtocolName(uri)}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-text-ghost" title={uri}>
                {uri}
              </p>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button className="w-full sm:flex-1" onClick={onConfirm}>
            <RefreshCw className="h-4 w-4" />
            Replace &amp; connect
          </Button>
          <Button variant="secondary" className="w-full sm:flex-1" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
