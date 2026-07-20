import { describe, it, expect } from 'vitest';

import { queryKeys } from '../query-keys';

// ── identities.all ──────────────────────────────────────────────────

describe('queryKeys.identities.all', () => {
  it('is a readonly array', () => {
    expect(Array.isArray(queryKeys.identities.all)).toBe(true);
  });

  it('contains "identities" as the first element', () => {
    expect(queryKeys.identities.all[0]).toBe('identities');
  });

  it('has exactly one element', () => {
    expect(queryKeys.identities.all).toHaveLength(1);
  });
});

// ── identities.detail ───────────────────────────────────────────────

describe('queryKeys.identities.detail', () => {
  it('returns an array', () => {
    expect(Array.isArray(queryKeys.identities.detail('did:dht:abc'))).toBe(
      true,
    );
  });

  it('starts with "identities" and includes the DID', () => {
    const key = queryKeys.identities.detail('did:dht:test123');
    expect(key[0]).toBe('identities');
    expect(key[1]).toBe('did:dht:test123');
  });

  it('has exactly two elements', () => {
    expect(queryKeys.identities.detail('did:dht:x')).toHaveLength(2);
  });

  it('produces different keys for different DIDs', () => {
    const key1 = queryKeys.identities.detail('did:dht:alice');
    const key2 = queryKeys.identities.detail('did:dht:bob');
    expect(key1).not.toEqual(key2);
  });

  it('is a superset of identities.all (prefix matching)', () => {
    const all = queryKeys.identities.all;
    const detail = queryKeys.identities.detail('did:dht:abc');
    // detail starts with all elements of `all`
    all.forEach((segment, i) => {
      expect(detail[i]).toBe(segment);
    });
    expect(detail.length).toBeGreaterThan(all.length);
  });
});

// ── identities sub-keys (profile, protocols, etc.) ──────────────────

const subKeyFactories = [
  'profile',
  'protocols',
  'socialGraph',
  'permissions',
  'wallets',
  'activity',
  'dwnEndpoints',
  'syncRemotes',
  'syncLinks',
  'audienceDeliveries',
] as const;

describe.each(subKeyFactories)('queryKeys.identities.%s', (subKey) => {
  const factory = queryKeys.identities[subKey];

  it('returns an array', () => {
    expect(Array.isArray(factory('did:dht:test'))).toBe(true);
  });

  it('has exactly three elements', () => {
    expect(factory('did:dht:test')).toHaveLength(3);
  });

  it('starts with "identities", then the DID, then the sub-key name', () => {
    const key = factory('did:dht:myDid');
    expect(key[0]).toBe('identities');
    expect(key[1]).toBe('did:dht:myDid');
    expect(key[2]).toBe(subKey);
  });

  it('produces different keys for different DIDs', () => {
    const key1 = factory('did:dht:alice');
    const key2 = factory('did:dht:bob');
    expect(key1).not.toEqual(key2);
  });

  it('is a superset of identities.detail (prefix matching for invalidation)', () => {
    const did = 'did:dht:prefix-test';
    const detail = queryKeys.identities.detail(did);
    const subKeyResult = factory(did);
    detail.forEach((segment, i) => {
      expect(subKeyResult[i]).toBe(segment);
    });
    expect(subKeyResult.length).toBeGreaterThan(detail.length);
  });

  it('is a superset of identities.all (prefix matching for invalidation)', () => {
    const all = queryKeys.identities.all;
    const subKeyResult = factory('did:dht:all-test');
    all.forEach((segment, i) => {
      expect(subKeyResult[i]).toBe(segment);
    });
    expect(subKeyResult.length).toBeGreaterThan(all.length);
  });
});

// ── didLookup ───────────────────────────────────────────────────────

describe('queryKeys.didLookup', () => {
  it('returns an array', () => {
    expect(Array.isArray(queryKeys.didLookup('did:dht:lookup-test'))).toBe(
      true,
    );
  });

  it('has exactly two elements', () => {
    expect(queryKeys.didLookup('did:dht:test')).toHaveLength(2);
  });

  it('starts with "didLookup" and includes the DID', () => {
    const key = queryKeys.didLookup('did:dht:someuser');
    expect(key[0]).toBe('didLookup');
    expect(key[1]).toBe('did:dht:someuser');
  });

  it('produces different keys for different DIDs', () => {
    const key1 = queryKeys.didLookup('did:dht:user1');
    const key2 = queryKeys.didLookup('did:dht:user2');
    expect(key1).not.toEqual(key2);
  });

  it('does not share a prefix with identities keys', () => {
    const lookup = queryKeys.didLookup('did:dht:x');
    const identitiesAll = queryKeys.identities.all;
    expect(lookup[0]).not.toBe(identitiesAll[0]);
  });
});
