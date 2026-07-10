#!/usr/bin/env node
/**
 * Generates the themed Enbox brand assets committed under `public/`:
 *
 *   logo-blue.svg / logo-rose.svg   — the stacked-squares mark, one per accent
 *   og-blue.png  / og-rose.png      — 1200×630 Open Graph card (mark on dark)
 *
 * The mark is three overlapping rounded squares receding into depth (back
 * square dimmest, front square brightest) with a dot at the intersection.
 * Palettes map that dim → mid → bright ramp onto the product accents from
 * `src/app.css` (`--accent` rose #ff6b8a, blue #3b82f6). Icon sources carry
 * the dark brand tile (#0a0a0f) full-bleed so generated apple-touch and
 * maskable icons never composite the bright front square onto white.
 *
 * Run from the repo root after changing palettes or geometry:
 *
 *   bun scripts/generate-brand-assets.mjs
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

const BACKGROUND = '#0a0a0f';

// [back square, mid square, front square]; the dot shares the front color.
const PALETTES = {
  blue: ['#1d4ed8', '#3b82f6', '#dbeafe'],
  rose: ['#cc2955', '#ff6b8a', '#ffe1e8'],
};

const VIEWBOX = 40;

/** The stacked-squares mark, drawn in viewBox 0 0 40 40. */
function markShapes(palette) {
  const [back, mid, front] = palette;
  return `  <rect x="4" y="4" width="20" height="20" rx="4" stroke="${back}" stroke-width="1.5" fill="none"/>
  <rect x="10" y="10" width="20" height="20" rx="4" stroke="${mid}" stroke-width="1.5" fill="none"/>
  <rect x="16" y="16" width="20" height="20" rx="4" stroke="${front}" stroke-width="1.5" fill="none"/>
  <circle cx="26" cy="26" r="2.5" fill="${front}"/>`;
}

function markSvg(palette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}">
  <rect width="${VIEWBOX}" height="${VIEWBOX}" fill="${BACKGROUND}"/>
${markShapes(palette)}
</svg>
`;
}

function ogSvg(palette) {
  const width = 1200;
  const height = 630;
  const markSize = 400;
  const x = (width - markSize) / 2;
  const y = (height - markSize) / 2;
  const scale = markSize / VIEWBOX;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${BACKGROUND}"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
${markShapes(palette)}
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
