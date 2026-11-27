import { useEffect, useState } from 'react';
import type { ExecuteConnectApprovalParams } from '@enbox/agent';

export type ConnectApprovalPhase = Parameters<
  NonNullable<ExecuteConnectApprovalParams['onProgress']>
>[0]['phase'];

export const SLOW_APPROVAL_HINT_DELAY_MS = 5_000;
export const SLOW_APPROVAL_HINT = 'Taking longer than usual — waiting on your storage server...';

const PHASE_LABELS: Record<ConnectApprovalPhase, string> = {
  delegate            : 'Preparing connection...',
  modules             : 'Setting up app data types...',
  'permission-grants' : 'Creating permissions...',
  'grant-keys'        : 'Securing encrypted access...',
  revocations         : 'Finalizing permissions...',
};

/** Maps an SDK connect approval phase to user-facing status copy. */
export function formatConnectApprovalPhase(phase: ConnectApprovalPhase): string {
  return PHASE_LABELS[phase] ?? 'Authorizing...';
}

/**
 * Becomes `true` after an interactive async operation stays active longer than
 * `delayMs`, resetting immediately once the operation ends.
 */
export function useSlowOperationHint(
  active: boolean,
  delayMs: number = SLOW_APPROVAL_HINT_DELAY_MS,
): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }

    const timer = setTimeout(() => {
      setSlow(true);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [active, delayMs]);

  return active && slow;
}
