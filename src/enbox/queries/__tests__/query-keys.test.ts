import { describe, expect, it } from 'vitest';

import { queryKeys } from '../query-keys';

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

const subKeyFactories = [
  'profile',
  'protocols',
  'permissions',
  'permissionHistory',
  'activity',
  'dwnEndpoints',
  'syncStatus',
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

  it('is a superset of identities.all (prefix matching for invalidation)', () => {
    const all = queryKeys.identities.all;
    const subKeyResult = factory('did:dht:all-test');
    all.forEach((segment, i) => {
      expect(subKeyResult[i]).toBe(segment);
    });
    expect(subKeyResult.length).toBeGreaterThan(all.length);
  });
});
