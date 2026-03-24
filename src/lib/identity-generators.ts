/**
 * Deterministic generators for identity defaults.
 *
 * All generators derive output from a seed string (typically the DID URI)
 * so that the same DID always produces the same avatar, banner, and name.
 * This ensures visual consistency without requiring user input.
 */

// ── Simple hash function ───────────────────────────────────────────

/** FNV-1a 32-bit hash. Fast, deterministic, good distribution. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/** Get a deterministic float [0, 1) from a seed and index. */
function seededRandom(seed: string, index: number): number {
  return (fnv1a(seed + ':' + index) % 10000) / 10000;
}

// ── HSL colour helpers ─────────────────────────────────────────────

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── Name generation ────────────────────────────────────────────────

const ADJECTIVES = [
  'Bright', 'Calm', 'Bold', 'Swift', 'Keen',
  'Warm', 'Cool', 'Wise', 'Kind', 'True',
  'Brave', 'Free', 'Vivid', 'Noble', 'Quick',
  'Gentle', 'Lucid', 'Agile', 'Witty', 'Merry',
  'Daring', 'Serene', 'Lively', 'Steady', 'Clever',
  'Radiant', 'Cosmic', 'Stellar', 'Curious', 'Mystic',
];

const NOUNS = [
  'Fox', 'Owl', 'Bear', 'Hawk', 'Wolf',
  'Hare', 'Lynx', 'Dove', 'Stag', 'Wren',
  'Panda', 'Otter', 'Raven', 'Crane', 'Finch',
  'Tiger', 'Eagle', 'Coral', 'Cedar', 'River',
  'Ember', 'Spark', 'Comet', 'Prism', 'Atlas',
  'Nova', 'Crest', 'Drift', 'Quill', 'Shade',
];

/**
 * Generate a deterministic friendly name from a seed.
 * e.g. "Curious Panda", "Bold Raven"
 */
export function generateName(seed: string): string {
  const adjIdx = fnv1a(seed + ':adj') % ADJECTIVES.length;
  const nounIdx = fnv1a(seed + ':noun') % NOUNS.length;
  return `${ADJECTIVES[adjIdx]} ${NOUNS[nounIdx]}`;
}

// ── Avatar generation (canvas-based geometric pattern) ─────────────

/**
 * Generate a deterministic avatar image as a Blob.
 *
 * Produces a 5x5 symmetric grid pattern (like GitHub's identicons)
 * with colours derived from the seed. The result is a 256x256 PNG.
 */
export async function generateAvatar(seed: string): Promise<Blob> {
  const size = 256;
  const gridSize = 5;
  const cellSize = size / (gridSize + 2); // 1 cell padding on each side
  const padding = cellSize;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background
  const bgHue = seededRandom(seed, 0) * 360;
  ctx.fillStyle = hslToHex(bgHue, 20, 15);
  ctx.fillRect(0, 0, size, size);

  // Foreground colour
  const fgHue = (bgHue + 120 + seededRandom(seed, 1) * 120) % 360;
  const fgSat = 55 + seededRandom(seed, 2) * 25;
  const fgLight = 55 + seededRandom(seed, 3) * 15;
  ctx.fillStyle = hslToHex(fgHue, fgSat, fgLight);

  // Generate a symmetric grid pattern
  // Only generate left half + center column, mirror for right half
  const halfCols = Math.ceil(gridSize / 2);
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < halfCols; col++) {
      const filled = seededRandom(seed, 10 + row * gridSize + col) > 0.4;
      if (!filled) continue;

      // Draw left side
      const x = padding + col * cellSize;
      const y = padding + row * cellSize;
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 4);
      ctx.fill();

      // Mirror to right side (skip center column for odd grids)
      const mirrorCol = gridSize - 1 - col;
      if (mirrorCol !== col) {
        const mx = padding + mirrorCol * cellSize;
        ctx.beginPath();
        ctx.roundRect(mx + 1, y + 1, cellSize - 2, cellSize - 2, 4);
        ctx.fill();
      }
    }
  }

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

// ── Banner generation (gradient) ───────────────────────────────────

/**
 * Generate a deterministic banner/hero image as a Blob.
 *
 * Produces a smooth gradient with subtle noise texture.
 * The result is a 1200x400 PNG.
 */
export async function generateBanner(seed: string): Promise<Blob> {
  const width = 1200;
  const height = 400;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Generate two harmonious colours
  const hue1 = seededRandom(seed, 20) * 360;
  const hue2 = (hue1 + 30 + seededRandom(seed, 21) * 60) % 360;
  const sat = 40 + seededRandom(seed, 22) * 30;

  const color1 = hslToHex(hue1, sat, 20);
  const color2 = hslToHex(hue2, sat, 30);

  // Diagonal gradient
  const angle = seededRandom(seed, 23) * 0.5 + 0.1; // 0.1 to 0.6 radians
  const gx = Math.cos(angle) * width;
  const gy = Math.sin(angle) * height;
  const gradient = ctx.createLinearGradient(0, 0, gx, gy);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(1, color2);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Subtle noise overlay for texture
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const noise = (seededRandom(seed, 100 + (i >> 4)) - 0.5) * 12;
    pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise));
    pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + noise));
    pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + noise));
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png', 0.85);
  });
}
