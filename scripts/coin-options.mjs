// coin-options.mjs — a contact sheet of clean, on-brand coin marks to choose
// from. Palette locked to the site: bg #0a0a0b, mint #43ffb4, mono type.
// Renders one PNG per option + a 2x2 contact sheet. Pick one; make-coin-image
// then finalizes it as darkcoin.png.
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.join(process.cwd(), 'classic', 'coin-options');
fs.mkdirSync(OUT, { recursive: true });
const MINT = '#43ffb4', BG = '#0a0a0b';

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs><filter id="g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
  <circle cx="500" cy="500" r="492" fill="${BG}"/>
  <circle cx="500" cy="500" r="492" fill="none" stroke="${MINT}" stroke-width="7"/>
  ${inner}
</svg>`;

// A — the pure brand diamond. Exactly the ◆ from the wordmark. Maximum clean.
const A = frame(`<path d="M500 300 L640 500 L500 700 L360 500 Z" fill="none" stroke="${MINT}" stroke-width="26" stroke-linejoin="round" filter="url(#g)"/>`);

// B — spire: the ◆ beacon over one clean solid tower silhouette. Building, but
// simplified to a single confident shape.
const B = frame(`
  <path d="M500 232 L556 300 L500 368 L444 300 Z" fill="${MINT}" filter="url(#g)"/>
  <path d="M440 400 L560 400 L590 720 L410 720 Z" fill="none" stroke="${MINT}" stroke-width="22" stroke-linejoin="round"/>
  <line x1="500" y1="400" x2="500" y2="720" stroke="${MINT}" stroke-width="10" opacity="0.5"/>`);

// C — skyline: ◆ over a minimal three-peak skyline. Reads as a city instantly.
const C = frame(`
  <path d="M500 250 L548 312 L500 374 L452 312 Z" fill="${MINT}" filter="url(#g)"/>
  <g fill="none" stroke="${MINT}" stroke-width="22" stroke-linejoin="round">
    <path d="M330 700 L330 560 L410 560 L410 700"/>
    <path d="M450 700 L450 470 L560 470 L560 700"/>
    <path d="M600 700 L600 590 L680 590 L680 700"/>
  </g>
  <line x1="300" y1="712" x2="700" y2="712" stroke="${MINT}" stroke-width="12"/>`);

// D — monogram: a diamond with the negative-space notch of a doorway/tower —
// coin and building fused into one glyph.
const D = frame(`
  <path d="M500 285 L655 500 L500 715 L345 500 Z" fill="${MINT}" filter="url(#g)"/>
  <path d="M500 715 L345 500 L500 285 Z" fill="${BG}" opacity="0.28"/>
  <rect x="470" y="560" width="60" height="120" rx="4" fill="${BG}"/>`);

const opts = { A_diamond: A, B_spire: B, C_skyline: C, D_monogram: D };
for (const [name, svg] of Object.entries(opts)) {
  fs.writeFileSync(path.join(OUT, name + '.svg'), svg);
}

try {
  const sharp = (await import('sharp')).default;
  const tiles = [];
  for (const [name, svg] of Object.entries(opts)) {
    await sharp(Buffer.from(svg)).png().resize(1000, 1000).toFile(path.join(OUT, name + '.png'));
    tiles.push({ name, buf: await sharp(Buffer.from(svg)).png().resize(460, 460).toBuffer() });
  }
  // 2x2 contact sheet with labels
  const label = (t, x, y) => Buffer.from(
    `<svg width="460" height="40"><text x="20" y="26" font-family="monospace" font-size="20" fill="${MINT}">${t}</text></svg>`);
  const sheet = sharp({ create: { width: 960, height: 1020, channels: 4, background: BG } });
  const comp = [];
  const pos = [[20, 20], [500, 20], [20, 540], [500, 540]];
  Object.keys(opts).forEach((name, i) => {
    comp.push({ input: tiles[i].buf, left: pos[i][0], top: pos[i][1] });
    comp.push({ input: Buffer.from(`<svg width="460" height="36"><text x="6" y="26" font-family="monospace" font-size="22" fill="${MINT}">${name.replace('_', ' · ')}</text></svg>`), left: pos[i][0], top: pos[i][1] + 462 });
  });
  await sheet.composite(comp).png().toFile(path.join(OUT, 'contact-sheet.png'));
  console.log('rendered 4 options + contact-sheet.png in classic/coin-options/');
} catch (e) {
  console.log('sharp unavailable — SVGs written. (' + e.message.slice(0, 60) + ')');
}
