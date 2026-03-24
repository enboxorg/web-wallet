import { describe, it, expect, beforeEach } from 'vitest';
import { useDWebConnectStore } from '../dweb-connect-store';
import type { DWebConnectRequest } from '../dweb-connect-store';

function makeRequest(overrides?: Partial<DWebConnectRequest>): DWebConnectRequest {
  return {
    origin: 'https://app.example.com',
    data: { method: 'test' },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('dweb-connect-store', () => {
  beforeEach(() => {
    useDWebConnectStore.setState({
      pendingRequests: [],
      walletReady: false,
    });
  });

  describe('initial state', () => {
    it('starts with empty pendingRequests and walletReady=false', () => {
      const state = useDWebConnectStore.getState();
      expect(state.pendingRequests).toEqual([]);
      expect(state.walletReady).toBe(false);
    });
  });

  describe('addRequest', () => {
    it('adds a request to the pending queue', () => {
      const req = makeRequest();
      useDWebConnectStore.getState().addRequest(req);
      expect(useDWebConnectStore.getState().pendingRequests).toEqual([req]);
    });

    it('appends multiple requests in order', () => {
      const req1 = makeRequest({ origin: 'https://a.com', timestamp: 1 });
      const req2 = makeRequest({ origin: 'https://b.com', timestamp: 2 });
      const req3 = makeRequest({ origin: 'https://c.com', timestamp: 3 });

      useDWebConnectStore.getState().addRequest(req1);
      useDWebConnectStore.getState().addRequest(req2);
      useDWebConnectStore.getState().addRequest(req3);

      expect(useDWebConnectStore.getState().pendingRequests).toEqual([
        req1,
        req2,
        req3,
      ]);
    });

    it('does not mutate the previous array reference', () => {
      const before = useDWebConnectStore.getState().pendingRequests;
      useDWebConnectStore.getState().addRequest(makeRequest());
      const after = useDWebConnectStore.getState().pendingRequests;
      expect(before).not.toBe(after);
    });
  });

  describe('consumeRequest', () => {
    it('returns undefined when queue is empty', () => {
      const result = useDWebConnectStore.getState().consumeRequest();
      expect(result).toBeUndefined();
    });

    it('returns and removes the first request (FIFO)', () => {
      const req1 = makeRequest({ timestamp: 1 });
      const req2 = makeRequest({ timestamp: 2 });
      useDWebConnectStore.getState().addRequest(req1);
      useDWebConnectStore.getState().addRequest(req2);

      const consumed = useDWebConnectStore.getState().consumeRequest();
      expect(consumed).toEqual(req1);
      expect(useDWebConnectStore.getState().pendingRequests).toEqual([req2]);
    });

    it('empties the queue after consuming all requests', () => {
      useDWebConnectStore.getState().addRequest(makeRequest({ timestamp: 1 }));
      useDWebConnectStore.getState().addRequest(makeRequest({ timestamp: 2 }));

      useDWebConnectStore.getState().consumeRequest();
      useDWebConnectStore.getState().consumeRequest();

      expect(useDWebConnectStore.getState().pendingRequests).toEqual([]);
      expect(useDWebConnectStore.getState().consumeRequest()).toBeUndefined();
    });
  });

  describe('setWalletReady', () => {
    it('sets walletReady to true', () => {
      useDWebConnectStore.getState().setWalletReady(true);
      expect(useDWebConnectStore.getState().walletReady).toBe(true);
    });

    it('sets walletReady back to false', () => {
      useDWebConnectStore.getState().setWalletReady(true);
      useDWebConnectStore.getState().setWalletReady(false);
      expect(useDWebConnectStore.getState().walletReady).toBe(false);
    });

    it('does not affect pendingRequests', () => {
      const req = makeRequest();
      useDWebConnectStore.getState().addRequest(req);
      useDWebConnectStore.getState().setWalletReady(true);
      expect(useDWebConnectStore.getState().pendingRequests).toEqual([req]);
    });
  });

  describe('interleaved operations', () => {
    it('supports add -> consume -> add -> consume cycle', () => {
      const req1 = makeRequest({ origin: 'https://a.com', timestamp: 1 });
      const req2 = makeRequest({ origin: 'https://b.com', timestamp: 2 });

      useDWebConnectStore.getState().addRequest(req1);
      expect(useDWebConnectStore.getState().consumeRequest()).toEqual(req1);

      useDWebConnectStore.getState().addRequest(req2);
      expect(useDWebConnectStore.getState().consumeRequest()).toEqual(req2);

      expect(useDWebConnectStore.getState().pendingRequests).toEqual([]);
    });
  });
});
