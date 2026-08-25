// make-coin-image.mjs — the $DARKCOIN mark, ASCII-native.
// A monospace skyline rendered in ACTUAL block/box characters on near-black,
// dim phosphor green with scanlines and a binary baseline — a terminal glyph,
// not a vector logo. Renders classic/darkcoin.svg + darkcoin.png (1000×1000)
// and classic/darkcoin-favicon.svg.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'classic');
const BG = '#05070a';         // near-black
const DIM = '#1f6b52';        // deep terminal green (structure)
const MID = '#2fa87d';        // mid phosphor
const HOT = '#43ffb4';        // lit windows / beacon only — used sparingly
const RING = '#12growth';     // (placeholder replaced below)

// The skyline as monospace ASCII rows. Block elements build the towers; the
// last row is binary — the digital signature. Each row is drawn as one <text>
// so it is literally character art, not shapes.
const ROWS = [
  { t: '▄ █ ▄', c: MID },                       // ▄ █ ▄  (peaks)
  { t: '█▓█▓█', c: MID },             // █▓█▓█
  { t: '█░█░█', c: DIM },             // █░█░█
  { t: '█▓█▓█', c: DIM },             // █▓█▓█
  { t: '█░█░█', c: DIM },             // █░█░█
  { t: '█████', c: DIM },             // █████ (base)
];
const BEACON = '◆';       // ◆
const BINARY = '01001100 01100011';

// build scanlines
let scan = '';
for (let y = 60; y < 940; y += 7) scan += `<line x1="60" y1="${y}" x2="940" y2="${y}" stroke="#000" stroke-width="2" opacity="0.22"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <clipPath id="coin"><circle cx="500" cy="500" r="486"/></clipPath>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <radialGradient id="vig" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="#0a1a14"/><stop offset="70%" stop-color="${BG}"/><stop offset="100%" stop-color="#020304"/>
    </radialGradient>
  </defs>
  <circle cx="500" cy="500" r="486" fill="url(#vig)"/>
  <g clip-path="url(#coin)">${scan}</g>
  <circle cx="500" cy="500" r="486" fill="none" stroke="${DIM}" stroke-width="6"/>
  <circle cx="500" cy="500" r="452" fill="none" stroke="${DIM}" stroke-width="1.5" opacity="0.5" stroke-dasharray="2 10"/>

  <!-- beacon -->
  <text x="500" y="300" text-anchor="middle" font-family="'JetBrains Mono','Courier New',monospace"
        font-size="120" font-weight="700" fill="${HOT}" filter="url(#soft)">${BEACON}</text>

  <!-- the ascii skyline -->
  <g font-family="'JetBrains Mono','Courier New',monospace" font-size="118" font-weight="700"
     letter-spacing="8" text-anchor="middle" xml:space="preserve">
    ${ROWS.map((r, i) => `<text x="500" y="${400 + i * 82}" fill="${r.c}">${r.t}</text>`).join('\n    ')}
  </g>

  <!-- lit windows: a few HOT cells punched over the structure -->
  <g font-family="'JetBrains Mono','Courier New',monospace" font-size="118" font-weight="700"
     letter-spacing="8" text-anchor="middle" fill="${HOT}" opacity="0.9" xml:space="preserve">
    <text x="500" y="482">█▓█▓█</text>
  </g>

  <!-- binary baseline — the digital signature -->
  <text x="500" y="905" text-anchor="middle" font-family="'JetBrains Mono','Courier New',monospace"
        font-size="34" letter-spacing="6" fill="${MID}" opacity="0.85">${BINARY}</text>
</svg>`.replace(RING, DIM);

fs.writeFileSync(path.join(OUT, 'darkcoin.svg'), svg);
console.log('wrote classic/darkcoin.svg');

// Favicon — three block towers + beacon, the skyline at 16px.
const fav = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="${BG}"/>
  <rect x="2.5" y="2.5" width="59" height="59" rx="10" fill="none" stroke="${DIM}" stroke-width="3"/>
  <text x="32" y="26" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="${HOT}">◆</text>
  <text x="32" y="50" text-anchor="middle" font-family="monospace" font-size="22" font-weight="700" fill="${MID}" letter-spacing="1">█▓█</text>
</svg>`;
fs.writeFileSync(path.join(OUT, 'darkcoin-favicon.svg'), fav);
console.log('wrote classic/darkcoin-favicon.svg');

try {
  const sharp = (await import('sharp')).default;
  await sharp(Buffer.from(svg)).png().resize(1000, 1000).toFile(path.join(OUT, 'darkcoin.png'));
  console.log('wrote classic/darkcoin.png (1000x1000)');
} catch (e) {
  console.log('sharp unavailable — SVG written. (' + e.message.slice(0, 60) + ')');
}
