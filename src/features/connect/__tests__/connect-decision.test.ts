import { describe, expect, it } from 'vitest';

import { claimConnectDecision, resetConnectDecision } from '../connect-decision';

describe('connect decision latch', () => {
  it('allows exactly one decision until a new request resets it', () => {
    const latch = { current: false };

    expect(claimConnectDecision(latch)).toBe(true);
    expect(claimConnectDecision(latch)).toBe(false);

    resetConnectDecision(latch);
    expect(claimConnectDecision(latch)).toBe(true);
  });
});
