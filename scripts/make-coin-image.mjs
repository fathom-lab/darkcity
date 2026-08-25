// make-coin-image.mjs — the $DARKCOIN mark. Clean, dark, ASCII-native.
//
// The glyph is a monospace CHARACTER GRID: a tower of lit/dim cells over a
// binary baseline, drawn as actual grid squares (not font block-glyphs) so it
// rasterizes identically everywhere — no tofu. Dark phosphor on near-black,
// faint scanlines. A terminal artifact, not a logo.
//
// Renders classic/darkcoin.svg + darkcoin.png (1000×1000, pump.fun square)
// and classic/darkcoin-favicon.svg.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'classic');
const BG = '#060809';       // near-black
const DIM = '#14archived';  // placeholder (unused)
const OFF = '#0f2a20';      // unlit cell
const LOW = '#1f7a5b';      // dim phosphor
const HOT = '#43ffb4';      // lit
const EDGE = '#1c6b50';     // ring / structure

// 7-wide tower, narrowing; 1 = lit, 2 = dim, 0 = empty. A clean digital skyline.
const GRID = [
  [0,0,1,2,1,0,0],
  [0,2,1,1,1,2,0],
  [0,1,2,1,2,1,0],
  [2,1,1,2,1,1,2],
  [1,2,1,1,1,2,1],
  [1,1,2,1,2,1,1],
  [2,1,1,1,1,1,2],
  [1,1,1,1,1,1,1],
];
const CELL = 66, GAP = 12;
const cols = 7, rows = GRID.length;
const gridW = cols * CELL + (cols - 1) * GAP;
const gridH = rows * CELL + (rows - 1) * GAP;
const x0 = 500 - gridW / 2;
const y0 = 348;

let cells = '';
GRID.forEach((row, r) => row.forEach((v, c) => {
  if (v === 0) return;
  const x = x0 + c * (CELL + GAP);
  const y = y0 + r * (CELL + GAP);
  const fill = v === 1 ? HOT : LOW;
  const op = v === 1 ? 0.95 : 0.7;
  cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${fill}" opacity="${op}"/>`;
}));

let scan = '';
for (let y = 40; y < 960; y += 6) scan += `<line x1="40" y1="${y}" x2="960" y2="${y}" stroke="#000" stroke-width="2" opacity="0.20"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs><clipPath id="c"><circle cx="500" cy="500" r="486"/></clipPath></defs>
  <circle cx="500" cy="500" r="486" fill="${BG}"/>
  <g clip-path="url(#c)">
    <rect x="14" y="14" width="972" height="972" fill="${BG}"/>
    ${scan}
    <!-- beacon -->
    <path d="M500 250 L556 312 L500 374 L444 312 Z" fill="${HOT}"/>
    ${cells}
    <!-- binary baseline: the digital signature -->
    <text x="500" y="922" text-anchor="middle" font-family="'Courier New',monospace" font-size="38"
          letter-spacing="7" fill="${LOW}" opacity="0.9">01000100 01000011</text>
  </g>
  <circle cx="500" cy="500" r="486" fill="none" stroke="${EDGE}" stroke-width="6"/>
  <circle cx="500" cy="500" r="456" fill="none" stroke="${EDGE}" stroke-width="1.5" opacity="0.4" stroke-dasharray="3 9"/>
</svg>`.replace(DIM, LOW);

fs.writeFileSync(path.join(OUT, 'darkcoin.svg'), svg);
console.log('wrote classic/darkcoin.svg');

// Favicon — beacon + a 3x3 lit core, the mark at 16px.
const fc = (x, y, on) => `<rect x="${x}" y="${y}" width="9" height="9" rx="1.5" fill="${on ? HOT : OFF}"/>`;
let fcells = '';
[[0,1,0],[1,1,1],[1,0,1]].forEach((row, r) => row.forEach((v, c) => { fcells += fc(21 + c * 11, 34 + r * 11, v); }));
const fav = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${BG}"/>
  <path d="M32 14 L38 21 L32 28 L26 21 Z" fill="${HOT}"/>
  ${fcells}
  <rect x="2.5" y="2.5" width="59" height="59" rx="10" fill="none" stroke="${EDGE}" stroke-width="3"/>
</svg>`;
fs.writeFileSync(path.join(OUT, 'darkcoin-favicon.svg'), fav);
console.log('wrote classic/darkcoin-favicon.svg');

try {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(svg)).png().resize(1000, 1000).toFile(path.join(OUT, 'darkcoin.png'));
  console.log('wrote classic/darkcoin.png (1000x1000)');
} catch (e) { console.log('sharp unavailable — SVG written. (' + e.message.slice(0, 50) + ')'); }
