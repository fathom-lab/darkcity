// ============================================================================
// hooks/market-ticker.js
// Moves market_prices on an interval so agents have actual alpha to find.
// Random walk with mean-reversion to the seed price, per-resource volatility,
// and volume-weighted drift. Kept conservative so the economy doesn't blow up.
// ============================================================================

// Base prices (mirrors the seed INSERT in server.js; mean-reversion anchor)
const ANCHORS = {
  steel:    24.50,
  glass:    19.00,
  timber:   12.00,
  stone:     8.00,
  copper:   45.00,
  crystal: 128.50,
  titanium: 92.00,
  carbon:   34.75,
};

// Per-resource annualized vol proxy (small so a tick moves ~1-4%)
const VOL = {
  steel:    0.02,
  glass:    0.025,
  timber:   0.03,
  stone:    0.015,
  copper:   0.03,
  crystal:  0.05,
  titanium: 0.04,
  carbon:   0.025,
};

// Mean-reversion strength. 0 = pure random walk (unbounded), 1 = snap back every tick.
const REVERSION = 0.15;

let interval = null;

function tickOnce(pool) {
  return pool.query('SELECT resource, price FROM market_prices').then(async ({ rows }) => {
    for (const r of rows) {
      const anchor = ANCHORS[r.resource] ?? Number(r.price);
      const vol = VOL[r.resource] ?? 0.025;
      // Box-Muller for a normal sample
      const u1 = Math.random() || 1e-6;
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      // Drift = random shock + pull toward anchor
      const curr = Number(r.price);
      const shock = curr * vol * z;
      const pull = (anchor - curr) * REVERSION;
      let next = curr + shock + pull;
      // Floor + ceiling sanity bands: 30%-300% of anchor
      next = Math.max(anchor * 0.3, Math.min(anchor * 3.0, next));
      next = Math.round(next * 100) / 100;
      const changePct = ((next - curr) / curr) * 100;
      await pool.query(
        `UPDATE market_prices
         SET price = $1,
             change_pct = $2,
             volume = FLOOR(COALESCE(NULLIF(volume, '')::numeric, 0) * (0.85 + RANDOM() * 0.3))::text
         WHERE resource = $3`,
        [next, Math.round(changePct * 100) / 100, r.resource]
      );
    }
  });
}

function start(pool, { intervalMs = 90_000 } = {}) {
  if (interval) return;
  console.log(`[market-ticker] starting — tick every ${intervalMs}ms`);
  // First tick quickly so prices start moving on boot
  tickOnce(pool).catch(e => console.error('[market-ticker] first tick:', e.message));
  interval = setInterval(() => {
    tickOnce(pool).catch(e => console.error('[market-ticker] tick error:', e.message));
  }, intervalMs);
}

function stop() {
  if (interval) { clearInterval(interval); interval = null; }
}

module.exports = { start, stop, tickOnce, ANCHORS };
