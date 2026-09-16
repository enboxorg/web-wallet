interface ConnectDecisionLatch {
  current: boolean;
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
