/**
 * Mock factories for Enbox SDK objects.
 * These create realistic-looking mock data for testing components
 * that display identity, profile, protocol, and permission information.
 */

import { vi } from 'vitest';

/** Create a mock identity object that matches what agent.identity.list() returns */
export function createMockIdentity(overrides?: Partial<{
  did: string;
  name: string;
}>) {
  const did = overrides?.did ?? 'did:dht:test123456789abcdefghijklmnopqrstuvwxyz';
  return {
    did: {
      uri: did,
      document: {},
    },
    metadata: {
      name: overrides?.name ?? 'Test Identity',
      tenant: 'did:dht:agenttestdid',
      connectedDid: did,
    },
    export: vi.fn().mockResolvedValue({ portableDid: { uri: did } }),
  };
}

/** Create a mock profile matching IdentityProfile type */
export function createMockProfile(overrides?: Partial<{
  did: string;
  displayName: string;
  tagline: string;
  bio: string;
  avatarUrl: string | null;
  heroUrl: string | null;
}>) {
  return {
    did: overrides?.did ?? 'did:dht:test123456789abcdefghijklmnopqrstuvwxyz',
    displayName: overrides?.displayName ?? 'Alice Test',
    tagline: overrides?.tagline ?? 'Building the decentralized web',
    bio: overrides?.bio ?? 'A test identity for unit tests.',
    avatarUrl: overrides?.avatarUrl ?? null,
    heroUrl: overrides?.heroUrl ?? null,
  };
}

/** Create a mock protocol entry */
export function createMockProtocol(overrides?: Partial<{
  uri: string;
  published: boolean;
}>) {
  return {
    uri: overrides?.uri ?? 'https://identity.foundation/protocols/profile',
    published: overrides?.published ?? true,
    definition: {
      protocol: overrides?.uri ?? 'https://identity.foundation/protocols/profile',
      published: overrides?.published ?? true,
    },
  };
}

/** Create a mock permission grant */
export function createMockPermission(overrides?: Partial<{
  id: string;
  grantee: string;
  protocol: string;
  interface: string;
}>) {
  return {
    id: overrides?.id ?? 'grant-123',
    grantee: overrides?.grantee ?? 'did:dht:app123',
    scope: {
      protocol: overrides?.protocol ?? 'https://identity.foundation/protocols/profile',
      interface: overrides?.interface ?? 'Records',
    },
    revoke: vi.fn().mockResolvedValue(undefined),
  };
}

/** Create a mock agent for hooks that need useAgent/useAuthStore */
export function createMockAgent(overrides?: { agentDid?: string }) {
  return {
    agentDid: { uri: overrides?.agentDid ?? 'did:dht:agenttestdid' },
    identity: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      import: vi.fn(),
      setMetadataName: vi.fn(),
      setDwnEndpoints: vi.fn(),
    },
    sync: {
      registerIdentity: vi.fn(),
      unregisterIdentity: vi.fn(),
      startSync: vi.fn().mockResolvedValue(undefined),
      stopSync: vi.fn().mockResolvedValue(undefined),
      sync: vi.fn().mockResolvedValue(undefined),
    },
    did: {
      delete: vi.fn(),
    },
  };
}
