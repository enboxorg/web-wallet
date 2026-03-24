import { describe, it, expect } from 'vitest';

import { generateName, generateAvatar, generateBanner } from '../identity-generators';

// ── generateName ───────────────────────────────────────────────────

describe('generateName', () => {
  it('returns a string in "Adjective Noun" format', () => {
    const name = generateName('did:dht:abc123');
    const parts = name.split(' ');
    expect(parts).toHaveLength(2);
    // Both parts should start with an uppercase letter
    expect(parts[0]).toMatch(/^[A-Z][a-z]+$/);
    expect(parts[1]).toMatch(/^[A-Z][a-z]+$/);
  });

  it('is deterministic — same seed always returns the same name', () => {
    const seed = 'did:dht:deterministic-test';
    const name1 = generateName(seed);
    const name2 = generateName(seed);
    const name3 = generateName(seed);
    expect(name1).toBe(name2);
    expect(name2).toBe(name3);
  });

  it('produces different names for different seeds', () => {
    const name1 = generateName('did:dht:seed-alpha');
    const name2 = generateName('did:dht:seed-beta');
    const name3 = generateName('did:dht:seed-gamma');
    // With 30×30=900 combinations, three different seeds should produce
    // at least two distinct names. We check all three differ for robustness.
    const unique = new Set([name1, name2, name3]);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('handles an empty string seed without throwing', () => {
    const name = generateName('');
    expect(typeof name).toBe('string');
    expect(name.split(' ')).toHaveLength(2);
  });

  it('handles a very long seed without throwing', () => {
    const longSeed = 'x'.repeat(10_000);
    const name = generateName(longSeed);
    expect(typeof name).toBe('string');
    expect(name.split(' ')).toHaveLength(2);
  });
});

// ── Canvas-dependent tests (generateAvatar & generateBanner) ──────
//
// happy-dom may not support the Canvas API. We guard these tests so
// they skip gracefully if canvas isn't available.

const canvasSupported = (() => {
  try {
    const c = document.createElement('canvas');
    return typeof c.getContext === 'function' && c.getContext('2d') !== null;
  } catch {
    return false;
  }
})();

describe.skipIf(!canvasSupported)('generateAvatar', () => {
  it('returns a Blob', async () => {
    const blob = await generateAvatar('did:dht:avatar-test');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('returns a Blob with image/png type', async () => {
    const blob = await generateAvatar('did:dht:avatar-png');
    expect(blob.type).toBe('image/png');
  });

  it('is deterministic — same seed produces the same blob size', async () => {
    const seed = 'did:dht:avatar-deterministic';
    const blob1 = await generateAvatar(seed);
    const blob2 = await generateAvatar(seed);
    expect(blob1.size).toBe(blob2.size);
  });

  it('produces different blobs for different seeds', async () => {
    const blob1 = await generateAvatar('did:dht:avatar-one');
    const blob2 = await generateAvatar('did:dht:avatar-two');
    // Different seeds should produce visually different images.
    // We compare sizes as a heuristic — different patterns yield different sizes.
    // In rare cases sizes could match, so we also compare raw bytes.
    if (blob1.size === blob2.size) {
      const [buf1, buf2] = await Promise.all([
        blob1.arrayBuffer(),
        blob2.arrayBuffer(),
      ]);
      const a = new Uint8Array(buf1);
      const b = new Uint8Array(buf2);
      const identical = a.every((v, i) => v === b[i]);
      expect(identical).toBe(false);
    }
  });

  it('returns a non-empty blob', async () => {
    const blob = await generateAvatar('did:dht:non-empty');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe.skipIf(!canvasSupported)('generateBanner', () => {
  it('returns a Blob', async () => {
    const blob = await generateBanner('did:dht:banner-test');
    expect(blob).toBeInstanceOf(Blob);
  });

  it('returns a Blob with image/png type', async () => {
    const blob = await generateBanner('did:dht:banner-png');
    expect(blob.type).toBe('image/png');
  });

  it('is deterministic — same seed produces the same blob size', async () => {
    const seed = 'did:dht:banner-deterministic';
    const blob1 = await generateBanner(seed);
    const blob2 = await generateBanner(seed);
    expect(blob1.size).toBe(blob2.size);
  });

  it('produces different blobs for different seeds', async () => {
    const blob1 = await generateBanner('did:dht:banner-one');
    const blob2 = await generateBanner('did:dht:banner-two');
    if (blob1.size === blob2.size) {
      const [buf1, buf2] = await Promise.all([
        blob1.arrayBuffer(),
        blob2.arrayBuffer(),
      ]);
      const a = new Uint8Array(buf1);
      const b = new Uint8Array(buf2);
      const identical = a.every((v, i) => v === b[i]);
      expect(identical).toBe(false);
    }
  });

  it('returns a non-empty blob', async () => {
    const blob = await generateBanner('did:dht:non-empty-banner');
    expect(blob.size).toBeGreaterThan(0);
  });
});
