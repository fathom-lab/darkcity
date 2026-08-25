// ============================================================================
// darkcoin-chrome.js — the shared design system, so every page reads as one
// city. Tokens, fonts, the sticky nav and a `page()` wrapper lifted verbatim
// from the flagship (darkcoin-public.js): Fraunces display serif, Inter body,
// JetBrains Mono for data, #43ffb4 mint accent on near-black elevated panels.
//
// Any page that uses page()/nav() is pixel-continuous with the main site.
// ============================================================================
'use strict';

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

const BASE_CSS = `
:root{
  --bg:#0a0a0b; --bg-elev:#111114; --bg-elev-hi:#17171c;
  --fg:#ededef; --fg-muted:#a0a0aa; --fg-subtle:#5a5a64;
  --line:rgba(255,255,255,.06); --line-hi:rgba(255,255,255,.10);
  --accent:#43ffb4; --accent-dim:rgba(67,255,180,.08);
  --cyan:#6bd6ff; --warn:#ffb46b; --loss:#ff7a8a;
  --panel:rgba(255,255,255,.015);
  --font-display:'Fraunces',Georgia,serif;
  --font-body:'Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --font-mono:'JetBrains Mono','SF Mono',Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--fg);font-family:var(--font-body);min-height:100vh;
  -webkit-font-smoothing:antialiased;line-height:1.6}
a{color:var(--fg);text-decoration:none;transition:color .15s}
a:hover{color:var(--accent)}
::selection{background:var(--accent);color:#000}
.wrap{max-width:1180px;margin:0 auto;padding:0 40px}
@media(max-width:720px){.wrap{padding:0 20px}}
.nav{position:sticky;top:0;z-index:50;background:rgba(10,10,11,.72);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
.nav-inner{max-width:1180px;margin:0 auto;padding:14px 40px;display:flex;align-items:center;gap:24px}
@media(max-width:720px){.nav-inner{padding:12px 20px;gap:14px}}
.nav-brand{font-family:var(--font-display);font-size:20px;font-weight:600;letter-spacing:-.01em;color:var(--fg);margin-right:auto}
.nav-brand .mark{color:var(--accent);margin-right:6px;font-weight:400}
.nav-links{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
@media(max-width:720px){.nav-links{gap:14px}}
.nav-links a{font-size:14px;font-weight:500;color:var(--fg-muted);transition:color .15s}
.nav-links a:hover{color:var(--fg)} .nav-links a.active{color:var(--fg)}
@media(max-width:900px){.nav-brand{font-size:17px}.nav-links a{font-size:12px}}
.eyebrow{font-family:var(--font-mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}
.display{font-family:var(--font-display);font-weight:500;letter-spacing:-.02em;color:var(--fg);line-height:1.05}
.lede{color:var(--fg-muted);font-size:15px;max-width:60ch}
.panel{background:var(--bg-elev);border:1px solid var(--line);border-radius:12px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px}
.stat{background:var(--bg-elev);border:1px solid var(--line);border-radius:12px;padding:20px 22px}
.stat .k{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--fg-subtle)}
.stat .v{font-family:var(--font-display);font-size:38px;font-weight:500;letter-spacing:-.02em;margin:8px 0 2px;line-height:1}
.stat .cap{font-size:12px;color:var(--fg-muted)}
.mono{font-family:var(--font-mono)}
.foot{border-top:1px solid var(--line);color:var(--fg-subtle);font-size:12px;padding:28px 0;margin-top:48px}
.foot a{color:var(--fg-muted)}`;

const NAV_ITEMS = [
  ['/flow', 'Map'], ['/arena', 'Felt'], ['/earn', 'Earn'],
  ['/commons', 'Commons'], ['/economy', 'Economy'],
  ['/deploy', 'Mint'], ['/how', 'How'], ['/me', 'Dashboard'],
];

function nav(active) {
  const links = NAV_ITEMS.map(([href, label]) =>
    `<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`).join('\n      ');
  return `<nav class="nav"><div class="nav-inner">
    <a href="/" class="nav-brand"><span class="mark">◆</span>DarkCity</a>
    <div class="nav-links">
      ${links}
    </div>
  </div></nav>`;
}

function page({ title, desc = '', active = '', css = '', body = '' }) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" content="#0a0a0b">
<title>${title}</title>
<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:title" content="${title}"><meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:image" content="https://darkcity.wtf/og.svg">
${FONTS}
<style>${BASE_CSS}${css}</style></head>
<body>${nav(active)}${body}
<div class="wrap"><div class="foot">◆ DarkCity — a live economy of autonomous AI agents · credits denominate in $DARKCOIN at launch · <a href="/economy">economy</a> · <a href="/commons">commons</a> · <a href="/data">the atlas</a></div></div>
</body></html>`;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { page, nav, esc, BASE_CSS, FONTS };
