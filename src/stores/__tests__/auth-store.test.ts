import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth-store';

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({
      initialized: false,
      unlocked: false,
      firstTime: false,
      agent: null,
    });
  });

  describe('initial state', () => {
    it('starts with all values at their defaults', () => {
      const state = useAuthStore.getState();
      expect(state.initialized).toBe(false);
      expect(state.unlocked).toBe(false);
      expect(state.firstTime).toBe(false);
      expect(state.agent).toBeNull();
    });
  });

  describe('setInitialized', () => {
    it('sets initialized and firstTime together', () => {
      useAuthStore.getState().setInitialized(true, true);
      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.firstTime).toBe(true);
    });

    it('can set initialized=true with firstTime=false', () => {
      useAuthStore.getState().setInitialized(true, false);
      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.firstTime).toBe(false);
    });

    it('does not affect other state fields', () => {
      const fakeAgent = { id: 'agent-1' };
      useAuthStore.setState({ agent: fakeAgent, unlocked: true });
      useAuthStore.getState().setInitialized(true, true);

      const state = useAuthStore.getState();
      expect(state.agent).toBe(fakeAgent);
      expect(state.unlocked).toBe(true);
    });
  });

  describe('setUnlocked', () => {
    it('sets initialized=true, unlocked=true, firstTime=false, and stores the agent', () => {
      const fakeAgent = { id: 'agent-1' };
      useAuthStore.getState().setInitialized(true, true);
      useAuthStore.getState().setUnlocked(fakeAgent);

      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.unlocked).toBe(true);
      expect(state.firstTime).toBe(false);
      expect(state.agent).toBe(fakeAgent);
    });

    it('replaces a previous agent', () => {
      const agent1 = { id: '1' };
      const agent2 = { id: '2' };
      useAuthStore.getState().setUnlocked(agent1);
      useAuthStore.getState().setUnlocked(agent2);

      expect(useAuthStore.getState().agent).toBe(agent2);
    });
  });

  describe('lock', () => {
    it('sets unlocked=false and agent=null', () => {
      useAuthStore.getState().setUnlocked({ id: 'agent' });
      expect(useAuthStore.getState().unlocked).toBe(true);

      useAuthStore.getState().lock();
      const state = useAuthStore.getState();
      expect(state.unlocked).toBe(false);
      expect(state.agent).toBeNull();
    });

    it('does not affect initialized or current firstTime value', () => {
      useAuthStore.getState().setInitialized(true, false);
      useAuthStore.getState().setUnlocked({ id: 'agent' });
      useAuthStore.getState().lock();

      const state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.firstTime).toBe(false);
    });
  });

  describe('full lifecycle', () => {
    it('supports init -> unlock -> lock cycle', () => {
      const agent = { type: 'agent' };

      // Init
      useAuthStore.getState().setInitialized(true, false);

      let state = useAuthStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.firstTime).toBe(false);
      expect(state.unlocked).toBe(false);

      // Unlock
      useAuthStore.getState().setUnlocked(agent);
      state = useAuthStore.getState();
      expect(state.unlocked).toBe(true);
      expect(state.agent).toBe(agent);

      // Lock
      useAuthStore.getState().lock();
      state = useAuthStore.getState();
      expect(state.unlocked).toBe(false);
      expect(state.agent).toBeNull();
      // Initialized persists
      expect(state.initialized).toBe(true);
    });
  });
});
