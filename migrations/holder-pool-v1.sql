-- ============================================================================
-- HOLDER POOL V1 — the "hold $STYXX, earn from the city" loop
-- ============================================================================
-- One rule: a slice of every real $STYXX inflow to DarkCity is siphoned into a
-- Holder Pool. Every 4h pulse, the pool is distributed pro-rata to every wallet
-- holding $STYXX on-chain that has taken at least one city action in the last
-- 7 days. Holders claim any amount, any time, from a per-wallet claimable
-- balance. No voting, no lockup, no snapshot-gaming.
--
-- Starts with the simplest tap: 10% of every mint fee. Future: extend to
-- commissions, sponsor fees, etc. Rate + filters are in economy_params so we
-- can tune without a migration.
-- ============================================================================

-- ── 1. Per-wallet claim ledger ─────────────────────────────────────────────
-- One row per wallet that has EVER earned from the pool. Accumulates
-- indefinitely; wallets pull any amount, any time, from their balance.
CREATE TABLE IF NOT EXISTS holder_claims (
  wallet_pubkey       TEXT PRIMARY KEY,
  claimable_styxx     NUMERIC NOT NULL DEFAULT 0 CHECK (claimable_styxx >= 0),
  lifetime_earned     NUMERIC NOT NULL DEFAULT 0,
  total_claimed       NUMERIC NOT NULL DEFAULT 0,
  first_earned_at     TIMESTAMPTZ,
  last_earned_at      TIMESTAMPTZ,
  last_claim_at       TIMESTAMPTZ,
  last_claim_tx       TEXT
);

CREATE INDEX IF NOT EXISTS idx_holder_claims_claimable
  ON holder_claims(claimable_styxx DESC) WHERE claimable_styxx > 0;

COMMENT ON TABLE holder_claims IS
  'Per-wallet claimable $STYXX accrued from the Holder Pool. Increment on distribution, decrement on claim.';


-- ── 2. Distribution ledger ────────────────────────────────────────────────
-- One row per distribution event (per source-of-funds + pulse). Lets us
-- reconcile on-chain transfers against the pool and debug unexpected drift.
CREATE TABLE IF NOT EXISTS holder_pool_distributions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source                    TEXT NOT NULL,              -- 'mint' | 'pulse' | 'commission' | ...
  source_ref                TEXT,                       -- quote_id, pulse_id, etc.
  pool_styxx                NUMERIC NOT NULL,           -- total tapped for this event
  active_holders_count      INTEGER,
  total_active_holding      NUMERIC,
  snapshot_taken_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  distributed_at            TIMESTAMPTZ,                -- NULL while pending
  distributed               BOOLEAN NOT NULL DEFAULT FALSE,
  note                      TEXT
);

CREATE INDEX IF NOT EXISTS idx_holder_pool_pending
  ON holder_pool_distributions(distributed, snapshot_taken_at)
  WHERE distributed = FALSE;

CREATE INDEX IF NOT EXISTS idx_holder_pool_source
  ON holder_pool_distributions(source, source_ref);

COMMENT ON TABLE holder_pool_distributions IS
  'One row per pool-funding event. pool_styxx is earmarked for pro-rata split to active holders.';


-- ── 3. Tunable rules ──────────────────────────────────────────────────────
-- Every knob the Holder Pool uses. Fetched by hooks/holder-pool.js at runtime,
-- so we can tune rates + filters without code deploys.
INSERT INTO economy_params (key, value) VALUES
  ('holder_pool_mint_fee_bps',         '2000'),  -- 20% of every mint fee goes to the pool
  ('holder_pool_pulse_bps',            '500'),   -- 5% of pulse net earnings also goes to holders
  ('holder_pool_min_holding_styxx',    '100'),   -- holdings below this don't earn (dust filter)
  ('holder_pool_min_payout_styxx',     '5'),     -- don't burn gas sending < 5 STYXX; roll forward
  ('holder_pool_max_holders_per_pulse','200'),   -- cap on-chain tx per pulse; rest rolls forward
  ('holder_pool_excluded_pubkeys',     '[]'),    -- JSON array of contracts/LPs/CEX to exclude
  ('holder_pool_paused',               'false')  -- operator kill-switch
ON CONFLICT (key) DO NOTHING;


-- ── 4. Operator view ──────────────────────────────────────────────────────
-- Convenience for ops: pending pool + top earners.
CREATE OR REPLACE VIEW v_holder_pool_state AS
  SELECT
    (SELECT COALESCE(SUM(pool_styxx), 0) FROM holder_pool_distributions WHERE distributed = FALSE)
      AS pending_pool_styxx,
    (SELECT COUNT(*) FROM holder_pool_distributions WHERE distributed = FALSE)
      AS pending_events,
    (SELECT COALESCE(SUM(claimable_styxx), 0) FROM holder_claims)
      AS total_unclaimed_styxx,
    (SELECT COALESCE(SUM(total_claimed), 0) FROM holder_claims)
      AS total_claimed_lifetime,
    (SELECT COUNT(*) FROM holder_claims WHERE claimable_styxx > 0)
      AS wallets_with_unclaimed;

COMMENT ON VIEW v_holder_pool_state IS
  'One-shot health check for the Holder Pool: pending vs unclaimed vs claimed.';
