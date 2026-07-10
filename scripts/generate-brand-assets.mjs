#!/usr/bin/env node
/**
 * Generates the themed Enbox brand assets committed under `public/`:
 *
 *   logo-blue.svg / logo-rose.svg   — the dot-grid mark, one per product accent
 *   og-blue.png  / og-rose.png      — 1200×630 Open Graph card (mark on dark)
 *
 * The mark is a 5×5 dot grid whose dot size and color depth increase toward
 * the center (tiers keyed by Manhattan distance from the center dot). The
 * geometry matches the original `logo.png` raster; palettes follow the
 * product accents in `src/app.css` (`--accent` rose #ff6b8a, blue #3b82f6).
 *
 * Run from the repo root after changing palettes or geometry:
 *
 *   node scripts/generate-brand-assets.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

// Lightest (outer corners) → darkest (center dot).
const PALETTES = {
  blue: ['#6cb3ff', '#4ba2ff', '#2d92ff', '#1385ff', '#0064cf'],
  rose: ['#ffb3c6', '#ff8fa6', '#ff6b8a', '#f2476e', '#cc2955'],
};

const VIEWBOX = 153;
const CENTERS = [11, 43.5, 76.5, 109.5, 142];

/** Dot tier for grid cell (row, col): [radius, palette index]. */
function dotTier(row, col) {
  const dr = Math.abs(row - 2);
  const dc = Math.abs(col - 2);
  switch (dr + dc) {
    case 0: return [14.8, 4];
    case 1: return [12.85, 3];
    case 2: return dr === 1 ? [11, 2] : [10.2, 2];
    case 3: return [9.2, 1];
    default: return [7.25, 0];
  }
}

function markSvg(palette) {
  const circles = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const [radius, tier] = dotTier(row, col);
      circles.push(`  <circle cx="${CENTERS[col]}" cy="${CENTERS[row]}" r="${radius}" fill="${palette[tier]}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">\n${circles.join('\n')}\n</svg>\n`;
}

function ogSvg(palette) {
  const width = 1200;
  const height = 630;
  const markSize = 360;
  const x = (width - markSize) / 2;
  const y = (height - markSize) / 2;
  const scale = markSize / VIEWBOX;
  const circles = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const [radius, tier] = dotTier(row, col);
      circles.push(`    <circle cx="${CENTERS[col]}" cy="${CENTERS[row]}" r="${radius}" fill="${palette[tier]}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="#0a0a0f"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
${circles.join('\n')}
  </g>
</svg>`;
}

for (const [name, palette] of Object.entries(PALETTES)) {
  const svgPath = path.join(publicDir, `logo-${name}.svg`);
  await writeFile(svgPath, markSvg(palette));
  console.log('wrote', svgPath);

  const ogPath = path.join(publicDir, `og-${name}.png`);
  await sharp(Buffer.from(ogSvg(palette))).png().toFile(ogPath);
  console.log('wrote', ogPath);
}
