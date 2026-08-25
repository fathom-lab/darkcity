// make-coin-image.mjs — the $DARKCOIN mark.
//
// This is the coin of the entire city, so it is an ICON, not an illustration:
// the ◆ beacon above a stepped tower with lit windows. No words. Matrix green
// on black, the site's palette. Legible at 32px and at 1000px.
//
// Renders classic/darkcoin.svg, classic/darkcoin.png (1000×1000 — pump.fun
// wants a square), and classic/darkcoin-favicon.svg.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'classic');
const GREEN = '#43ffb4';

// Stepped tower: three tiers, narrowing upward. Each tier is a slab with a
// row of windows; lit windows carry the glow. Simple, symmetric, readable.
const TIERS = [
  { w: 3, y: 372, lit: [1, 0, 1] },
  { w: 5, y: 470, lit: [0, 1, 0, 1, 0] },
  { w: 7, y: 568, lit: [1, 0, 1, 0, 1, 0, 1] },
];
const CELL = 54, GAP = 14, WIN_H = 62;
const CX = 500;

let tower = '';
for (const t of TIERS) {
  const totalW = t.w * CELL + (t.w - 1) * GAP;
  const x0 = CX - totalW / 2;
  tower += `  <rect x="${x0 - 14}" y="${t.y - 12}" width="${totalW + 28}" height="${WIN_H + 24}" rx="4" fill="#04150c" stroke="${GREEN}" stroke-width="3" opacity="0.9"/>\n`;
  t.lit.forEach((on, c) => {
    const x = x0 + c * (CELL + GAP);
    tower += on
      ? `  <rect x="${x}" y="${t.y}" width="${CELL}" height="${WIN_H}" rx="2" fill="${GREEN}" filter="url(#glow)"/>\n`
      : `  <rect x="${x}" y="${t.y}" width="${CELL}" height="${WIN_H}" rx="2" fill="#0a2417"/>\n`;
  });
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <filter id="glow" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <circle cx="500" cy="500" r="492" fill="#000"/>
  <circle cx="500" cy="500" r="492" fill="none" stroke="${GREEN}" stroke-width="10"/>
  <circle cx="500" cy="500" r="458" fill="none" stroke="${GREEN}" stroke-width="2" opacity="0.3"/>

  <!-- the beacon -->
  <path d="M 500 196 L 556 268 L 500 340 L 444 268 Z" fill="${GREEN}" filter="url(#glow)"/>

  <!-- the tower -->
${tower}
  <!-- ground -->
  <rect x="270" y="672" width="460" height="10" rx="5" fill="${GREEN}" filter="url(#glow)"/>
</svg>`;

fs.writeFileSync(path.join(OUT, 'darkcoin.svg'), svg);
console.log('wrote classic/darkcoin.svg');

// Favicon — the same mark, reduced to what survives at 16px.
const fav = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#000"/>
  <rect x="2.5" y="2.5" width="59" height="59" rx="10" fill="none" stroke="${GREEN}" stroke-width="3"/>
  <path d="M 32 12 L 39 20 L 32 28 L 25 20 Z" fill="${GREEN}"/>
  <rect x="23" y="32" width="18" height="8" fill="${GREEN}"/>
  <rect x="18" y="43" width="28" height="8" fill="${GREEN}"/>
</svg>`;
fs.writeFileSync(path.join(OUT, 'darkcoin-favicon.svg'), fav);
console.log('wrote classic/darkcoin-favicon.svg');

try {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(svg)).png().resize(1000, 1000).toFile(path.join(OUT, 'darkcoin.png'));
  console.log('wrote classic/darkcoin.png (1000x1000)');
} catch (e) {
  console.log('sharp unavailable — SVG written; export manually. (' + e.message.slice(0, 60) + ')');
}
