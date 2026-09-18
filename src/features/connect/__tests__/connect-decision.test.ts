import { describe, expect, it } from 'vitest';

import {
  claimConnectDecision,
  requireConnectApprovalContext,
  resetConnectDecision,
} from '../connect-decision';

describe('connect decision latch', () => {
  it('allows exactly one decision until a new request resets it', () => {
    const latch = { current: false };

    expect(claimConnectDecision(latch)).toBe(true);
    expect(claimConnectDecision(latch)).toBe(false);

    resetConnectDecision(latch);
    expect(claimConnectDecision(latch)).toBe(true);
  });
});

describe('connect approval context', () => {
  const agent = { id: 'agent-1' };
  const request = { state: 'request-1' };

  it('returns a fully narrowed live approval context', () => {
    expect(requireConnectApprovalContext(agent, request, 'did:dht:alice')).toEqual({
      agent,
      request,
      selectedDid: 'did:dht:alice',
    });
  });

  it.each([
    [null, request, 'did:dht:alice', /wallet locked/i],
    [agent, undefined, 'did:dht:alice', /request is no longer available/i],
    [agent, request, '', /No profile is selected/i],
  ])('rejects incomplete approval state', (candidateAgent, candidateRequest, did, error) => {
    expect(() => requireConnectApprovalContext(candidateAgent, candidateRequest, did))
      .toThrow(error);
  });
});
