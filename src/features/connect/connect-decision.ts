interface ConnectDecisionLatch {
  current: boolean;
}

interface ConnectApprovalContext<TAgent, TRequest> {
  agent: TAgent;
  request: TRequest;
  selectedDid: string;
}

/**
 * Resolve the live inputs required immediately before a connect approval.
 * These can disappear while inline onboarding awaits wallet/profile setup;
 * surfacing that race is safer than silently leaving a progress phase active.
 */
export function requireConnectApprovalContext<TAgent, TRequest>(
  agent: TAgent | null | undefined,
  request: TRequest | null | undefined,
  selectedDid: string | null | undefined,
): ConnectApprovalContext<TAgent, TRequest> {
  if (agent == null) {
    throw new Error('The wallet locked before authorization could begin. Unlock it and try again.');
  }
  if (request == null) {
    throw new Error('The connection request is no longer available. Start the connection again.');
  }
  if (!selectedDid) {
    throw new Error('No profile is selected for this connection.');
  }
  return { agent, request, selectedDid };
}

/**
 * Atomically claims a single-use connect request for one user decision.
 * React state updates are not synchronous guards, so approval and denial
 * handlers share this latch before starting any non-idempotent work.
 */
export function claimConnectDecision(latch: ConnectDecisionLatch): boolean {
  if (latch.current) return false;
  latch.current = true;
  return true;
}

export function resetConnectDecision(latch: ConnectDecisionLatch): void {
  latch.current = false;
}
